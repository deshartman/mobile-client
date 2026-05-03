/**
 * SMS messaging — plain Twilio Programmable Messaging API, 1:1 per thread.
 *
 * A "thread" is keyed locally by (userGuid, proxyAddress, remoteAddress).
 * Outbound: POST /messaging/send → client.messages.create({ to, from, body }).
 * Inbound: Twilio POSTs to the per-number smsUrl (/webhooks/messaging/inbound)
 *          which calls WebhookService.handleInboundSms directly.
 *
 * The local `messages` table is the source of truth. There is no remote mirror
 * (Conversations API was removed — it was overkill for 1:1 SMS).
 */
const twilio = require('twilio');
const { logOut, logError } = require('../utils/logger');

function normalizePhone(s) {
    return (s || '').replace(/\D/g, '');
}

// Twilio requires E.164 for to/from. Callers may hand us values where a URL-
// decoded `+` became a space (e.g. "?number=+61..." → " 61..."), so rebuild
// from digits.
function toE164(s) {
    if (!s) return s;
    const digits = normalizePhone(s);
    return digits ? `+${digits}` : s;
}

class MessagingService {
    constructor({ contactService, userService, messagesRepo, sseService }) {
        this.contactService = contactService;
        this.userService = userService;
        this.messagesRepo = messagesRepo;
        this.sseService = sseService;
        this.client = null;
    }

    /**
     * Lazy-init the Twilio client. Thread hydration (read-only SQLite) works
     * without these env vars; sendMessage surfaces a clear error if missing.
     */
    _getClient() {
        if (this.client) return this.client;

        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;

        const missing = [];
        if (!accountSid) missing.push('TWILIO_ACCOUNT_SID');
        if (!authToken) missing.push('TWILIO_AUTH_TOKEN');

        if (missing.length > 0) {
            logError('MessagingService', `Missing required env: ${missing.join(', ')}`);
            throw new Error(`Missing required messaging env variables: ${missing.join(', ')}`);
        }

        this.client = twilio(accountSid, authToken);
        logOut('MessagingService', 'Twilio client initialised for SMS');
        return this.client;
    }

    resolveContactGuid(userGuid, remoteAddress) {
        const target = normalizePhone(remoteAddress);
        if (!target) return null;
        const contacts = this.contactService.getContacts(userGuid);
        for (const contact of contacts) {
            for (const identity of contact.identities || []) {
                if (normalizePhone(identity.value) === target) return contact.guid;
            }
        }
        return null;
    }

    /**
     * Find or create the local thread row for this pair. Separate from
     * message insertion so both send and inbound paths share it.
     */
    ensureThread({ userGuid, remoteAddress, contactGuid }) {
        const user = this.userService.getUser(userGuid);
        if (!user) throw new Error('User not found');
        const proxyAddress = user.twilioNumber;
        if (!proxyAddress) {
            throw new Error(`User ${userGuid} has no twilio_number configured`);
        }

        const existing = this.messagesRepo.findThreadByPair(userGuid, proxyAddress, remoteAddress);
        if (existing) return existing;

        const resolvedContactGuid = contactGuid || this.resolveContactGuid(userGuid, remoteAddress);
        logOut('MessagingService', `Creating thread for ${userGuid}: ${proxyAddress} <-> ${remoteAddress}`);
        return this.messagesRepo.insertThread({
            userGuid,
            contactGuid: resolvedContactGuid,
            remoteAddress,
            proxyAddress
        });
    }

    async sendMessage({ userGuid, remoteAddress, body, contactGuid }) {
        if (!userGuid || !remoteAddress || !body) {
            throw new Error('Missing required fields: userGuid, remoteAddress, body');
        }
        const normalizedRemote = toE164(remoteAddress);
        const thread = this.ensureThread({
            userGuid,
            remoteAddress: normalizedRemote,
            contactGuid
        });

        logOut('MessagingService', `Sending SMS from ${thread.proxyAddress} → ${thread.remoteAddress}`);
        const createArgs = {
            to: thread.remoteAddress,
            from: thread.proxyAddress,
            body
        };
        // Ask Twilio to POST delivery updates to our status callback so the
        // client can show delivered/failed indicators. Only set if we have a
        // public base URL; omit in local dev to avoid bogus callbacks.
        const serverBaseUrl = process.env.SERVER_BASE_URL;
        if (serverBaseUrl && /^https?:\/\//.test(serverBaseUrl)) {
            createArgs.statusCallback = `${serverBaseUrl.replace(/\/$/, '')}/webhooks/messaging/status`;
        }
        const message = await this._getClient().messages.create(createArgs);

        const datetime = message.dateCreated
            ? new Date(message.dateCreated).toISOString()
            : new Date().toISOString();

        const inserted = this.messagesRepo.insertMessageIfAbsent({
            messageSid: message.sid,
            threadId: thread.threadId,
            direction: 'outbound',
            author: thread.proxyAddress,
            body,
            datetime,
            index: null,
            // Twilio's `messages.create` resolves once they've accepted the
            // send; real delivery state arrives via the status callback.
            status: message.status || 'queued'
        });

        if (inserted && !thread.activityId) {
            const activity = this.contactService.addActivity(userGuid, {
                type: 'Message',
                datetime,
                duration: 0,
                identityValue: thread.remoteAddress,
                contactGuid: thread.contactGuid
            });
            this.messagesRepo.setThreadActivity(thread.threadId, activity.id);
        }

        if (inserted && this.sseService) {
            this.sseService.broadcast(userGuid, 'message.added', {
                messageSid: message.sid,
                threadId: thread.threadId,
                remoteAddress: thread.remoteAddress,
                proxyAddress: thread.proxyAddress,
                contactGuid: thread.contactGuid,
                direction: 'outbound',
                author: thread.proxyAddress,
                body,
                datetime,
                status: message.status || 'queued'
            });
        }

        return {
            threadId: thread.threadId,
            messageSid: message.sid,
            status: message.status || 'queued'
        };
    }

    getThread(userGuid, remoteAddress) {
        if (!userGuid || !remoteAddress) return { threadId: null, messages: [] };
        const normalizedRemote = toE164(remoteAddress);
        const thread = this.messagesRepo.findThreadByUserAndRemote(userGuid, normalizedRemote);
        if (!thread) return { threadId: null, messages: [] };
        return {
            threadId: thread.threadId,
            messages: this.messagesRepo.getMessages(thread.threadId)
        };
    }
}

module.exports = { MessagingService };
