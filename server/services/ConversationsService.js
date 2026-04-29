/**
 * Twilio Conversations service — SMS threads per (user_twilio_number, remote).
 *
 * Public API:
 *  - sendMessage({ userGuid, remoteAddress, body, contactGuid })
 *      Ensures a Conversation exists for the pair, adds an SMS participant if
 *      needed, then posts the message via Twilio. Does NOT write to the local
 *      messages table — the onMessageAdded webhook is the source of truth.
 *  - getThread(userGuid, remoteAddress)
 *      Returns { conversationSid, messages } for hydrating the message view.
 *  - resolveContactGuid(userGuid, remoteAddress)
 *      Used by WebhookService to attach a contact to inbound messages.
 */
const twilio = require('twilio');
const { logOut, logError } = require('../utils/logger');

function normalizePhone(s) {
    return (s || '').replace(/\D/g, '');
}

// Twilio requires E.164 for messagingBinding.address / proxyAddress. Callers
// into this service may hand us values that URL-decoded `+` into a space
// (e.g. "?number=+61..." → " 61..."), so rebuild from digits.
function toE164(s) {
    if (!s) return s;
    const digits = normalizePhone(s);
    return digits ? `+${digits}` : s;
}

class ConversationsService {
    constructor({ contactService, userService, messagesRepo, sseService }) {
        this.contactService = contactService;
        this.userService = userService;
        this.messagesRepo = messagesRepo;
        this.sseService = sseService;
        this.client = null;
        // Bounded dedup set for the inbound SMS bridge. Keyed by the SMS MessageSid
        // so a Twilio retry of the Messaging Service webhook doesn't post the same
        // inbound into the Conversation twice. Not persisted — process-local only.
        this._bridgedSmsSids = new Set();
        this._bridgedSmsSidsMax = 500;
    }

    /**
     * Lazy-init the Twilio client so the server starts even before the user has
     * set up their Messaging Service. Thread hydration (read-only SQLite) works
     * without these env vars; sendMessage surfaces a clear error if missing.
     */
    _getClient() {
        if (this.client) return this.client;

        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const messagingServiceSid = process.env.MESSAGING_SERVICE_SID;
        const conversationServiceSid = process.env.CONVERSATION_SERVICE_SID;

        const missing = [];
        if (!accountSid) missing.push('TWILIO_ACCOUNT_SID');
        if (!authToken) missing.push('TWILIO_AUTH_TOKEN');
        if (!messagingServiceSid) missing.push('MESSAGING_SERVICE_SID');
        if (!conversationServiceSid) missing.push('CONVERSATION_SERVICE_SID');

        if (missing.length > 0) {
            logError('ConversationsService', `Missing required env: ${missing.join(', ')}`);
            throw new Error(`Missing required Conversations env variables: ${missing.join(', ')}`);
        }

        this.messagingServiceSid = messagingServiceSid;
        this.conversationServiceSid = conversationServiceSid;
        this.client = twilio(accountSid, authToken);
        logOut('ConversationsService', `Twilio Conversations client initialised (service ${conversationServiceSid})`);
        return this.client;
    }

    _service() {
        return this._getClient().conversations.v1.services(this.conversationServiceSid);
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

    async _ensureConversation({ userGuid, remoteAddress, contactGuid }) {
        const user = this.userService.getUser(userGuid);
        if (!user) throw new Error('User not found');
        const proxyAddress = user.twilioNumber;
        if (!proxyAddress) {
            throw new Error(`User ${userGuid} has no twilio_number configured`);
        }

        const existing = this.messagesRepo.findConversationByPair(userGuid, proxyAddress, remoteAddress);
        if (existing) return existing;

        const resolvedContactGuid = contactGuid || this.resolveContactGuid(userGuid, remoteAddress);
        const service = this._service();

        logOut('ConversationsService', `Creating Conversation for ${userGuid}: ${proxyAddress} <-> ${remoteAddress}`);
        const conv = await service.conversations.create({
            messagingServiceSid: this.messagingServiceSid,
            friendlyName: `sms-${proxyAddress}-${remoteAddress}`
        });

        await service
            .conversations(conv.sid)
            .participants
            .create({
                'messagingBinding.address': remoteAddress,
                'messagingBinding.proxyAddress': proxyAddress
            });

        return this.messagesRepo.insertConversation({
            conversationSid: conv.sid,
            userGuid,
            contactGuid: resolvedContactGuid,
            remoteAddress,
            proxyAddress
        });
    }

    /**
     * Bridge an inbound SMS (received via Messaging Service "Send a webhook"
     * integration) into a Twilio Conversation so onMessageAdded fires and the
     * existing persistence/SSE path handles it. Returns true if the message was
     * bridged, false if it was deduped.
     *
     * The Messaging Service payload uses the standard Twilio SMS shape:
     *   From, To, Body, MessageSid (SMxxx), NumMedia, …
     */
    async bridgeInboundSms({ from, to, body, smsMessageSid }) {
        if (!from || !to || !smsMessageSid) {
            throw new Error('Missing required fields: from, to, smsMessageSid');
        }
        if (this._bridgedSmsSids.has(smsMessageSid)) {
            logOut('ConversationsService', `Inbound SMS ${smsMessageSid} already bridged — skipping`);
            return false;
        }

        const owner = this.userService.getUserByTwilioNumber(to);
        if (!owner) {
            throw new Error(`No user owns Twilio number ${to}`);
        }
        const userGuid = owner.userGUID;
        const proxyAddress = owner.userData.twilioNumber;

        // Once a Conversation exists with the remote bound as a participant,
        // Twilio auto-routes subsequent inbound SMS from that number into the
        // Conversation and fires onMessageAdded directly. Bridging again here
        // would produce a duplicate message. Only bridge when no Conversation
        // exists yet — i.e. the very first contact from a remote number.
        const existing = this.messagesRepo.findConversationByPair(userGuid, proxyAddress, from);
        if (existing) {
            logOut('ConversationsService', `Inbound SMS ${smsMessageSid}: Conversation ${existing.conversationSid} exists — skipping bridge (Twilio auto-routes)`);
            this._rememberBridgedSid(smsMessageSid);
            return false;
        }

        const conversation = await this._ensureConversation({
            userGuid,
            remoteAddress: from
        });

        logOut('ConversationsService', `Bridging first inbound SMS ${smsMessageSid} → ${conversation.conversationSid}`);
        await this._service()
            .conversations(conversation.conversationSid)
            .messages
            .create({
                author: from,
                body: body || '',
                xTwilioWebhookEnabled: 'true'
            });

        this._rememberBridgedSid(smsMessageSid);
        return true;
    }

    _rememberBridgedSid(smsMessageSid) {
        if (this._bridgedSmsSids.size >= this._bridgedSmsSidsMax) {
            const oldest = this._bridgedSmsSids.values().next().value;
            this._bridgedSmsSids.delete(oldest);
        }
        this._bridgedSmsSids.add(smsMessageSid);
    }

    async sendMessage({ userGuid, remoteAddress, body, contactGuid }) {
        if (!userGuid || !remoteAddress || !body) {
            throw new Error('Missing required fields: userGuid, remoteAddress, body');
        }
        const normalizedRemote = toE164(remoteAddress);
        const conversation = await this._ensureConversation({
            userGuid,
            remoteAddress: normalizedRemote,
            contactGuid
        });

        logOut('ConversationsService', `Posting message to ${conversation.conversationSid}`);
        const message = await this._service()
            .conversations(conversation.conversationSid)
            .messages
            .create({
                author: conversation.proxyAddress,
                body
            });

        // Persist the outbound immediately. The onMessageAdded webhook for
        // REST-created messages can be delayed or suppressed, so we can't rely
        // on it as the sole write path. INSERT OR IGNORE means a late webhook
        // arrival is a harmless no-op.
        const datetime = message.dateCreated
            ? new Date(message.dateCreated).toISOString()
            : new Date().toISOString();
        const index = message.index == null ? null : Number(message.index);

        const inserted = this.messagesRepo.insertMessageIfAbsent({
            messageSid: message.sid,
            conversationSid: conversation.conversationSid,
            direction: 'outbound',
            author: conversation.proxyAddress,
            body,
            datetime,
            index
        });

        if (inserted && !conversation.activityId) {
            const activity = this.contactService.addActivity(userGuid, {
                type: 'Message',
                datetime,
                duration: 0,
                identityValue: conversation.remoteAddress,
                contactGuid: conversation.contactGuid
            });
            this.messagesRepo.setConversationActivity(conversation.conversationSid, activity.id);
        }

        if (inserted && this.sseService) {
            this.sseService.broadcast(userGuid, 'message.added', {
                messageSid: message.sid,
                conversationSid: conversation.conversationSid,
                remoteAddress: conversation.remoteAddress,
                proxyAddress: conversation.proxyAddress,
                contactGuid: conversation.contactGuid,
                direction: 'outbound',
                author: conversation.proxyAddress,
                body,
                datetime,
                index
            });
        }

        return {
            conversationSid: conversation.conversationSid,
            messageSid: message.sid
        };
    }

    getThread(userGuid, remoteAddress) {
        if (!userGuid || !remoteAddress) return { conversationSid: null, messages: [] };
        const normalizedRemote = toE164(remoteAddress);
        const conversation = this.messagesRepo.findConversationByUserAndRemote(userGuid, normalizedRemote);
        if (!conversation) return { conversationSid: null, messages: [] };
        return {
            conversationSid: conversation.conversationSid,
            messages: this.messagesRepo.getMessages(conversation.conversationSid)
        };
    }
}

module.exports = { ConversationsService };
