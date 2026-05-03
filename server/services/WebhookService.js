const { logOut, logError } = require('../utils/logger');

class WebhookService {
    constructor({ contactService, userService, sseService, messagesRepo, messagingService }) {
        this.contactService = contactService;
        this.userService = userService;
        this.sseService = sseService;
        this.messagesRepo = messagesRepo;
        this.messagingService = messagingService;
        this.callMap = new Map();
    }

    /**
     * Associate a real Twilio CallSid with the originating user/contact so that
     * the status webhook can create the activity record when the call completes.
     */
    registerCallBySid(callSid, { userGuid, to, contactGuid }) {
        this.callMap.set(callSid, {
            userGuid,
            to,
            contactGuid: contactGuid || null,
            direction: 'outbound',
            startedAt: Date.now()
        });
        logOut('WebhookService', `Registered outbound call ${callSid} for user ${userGuid} → ${to}`);
    }

    /**
     * Associate an inbound CallSid with the user whose Twilio number was dialed.
     * Also push an 'incoming-call' SSE event so the browser can show the incoming UI.
     */
    registerIncomingCall({ callSid, from, to, userGuid }) {
        this.callMap.set(callSid, {
            userGuid,
            to: from,           // for activity logging, `to` is the *other* party (the caller)
            contactGuid: null,
            direction: 'inbound',
            startedAt: Date.now()
        });
        logOut('WebhookService', `Registered inbound call ${callSid} for user ${userGuid} (from ${from} → ${to})`);

        if (this.sseService) {
            this.sseService.broadcast(userGuid, 'incoming-call', { from, to, callSid });
        }
    }

    /**
     * Dispatch a voice status webhook payload.
     * Expected shape (matches Twilio): { CallSid, CallStatus, CallDuration }
     * Only 'completed' triggers activity creation.
     */
    handleVoiceStatus(payload) {
        const { CallSid, CallStatus, CallDuration, DialCallStatus, DialCallDuration } = payload;
        const mapping = this.callMap.get(CallSid);

        if (!mapping) {
            // Child legs of a <Dial> also POST to our status callback but aren't
            // registered (we only register the parent CallSid). Safe to ignore.
            logOut('WebhookService', `Voice webhook for unregistered CallSid: ${CallSid} (CallStatus=${CallStatus}, DialCallStatus=${DialCallStatus || 'n/a'})`);
            return;
        }

        logOut('WebhookService', `Voice status for ${CallSid}: CallStatus=${CallStatus}, DialCallStatus=${DialCallStatus || 'n/a'}`);

        // Two paths end an outbound call:
        //  1. CallStatus=completed — the parent leg fully ended.
        //  2. DialCallStatus=completed on the parent while CallStatus=in-progress —
        //     the dialed leg completed. Twilio surfaces DialCallDuration here.
        const dialFinished = DialCallStatus === 'completed';
        const parentFinished = CallStatus === 'completed';
        if (!dialFinished && !parentFinished) return;

        const rawSeconds = parseInt(DialCallDuration, 10)
            || parseInt(CallDuration, 10)
            || Math.round((Date.now() - mapping.startedAt) / 1000);
        const durationMinutes = Math.max(1, Math.round(rawSeconds / 60));

        this.contactService.addActivity(mapping.userGuid, {
            type: 'Phone',
            datetime: new Date().toISOString(),
            duration: durationMinutes,
            identityValue: mapping.to,
            contactGuid: mapping.contactGuid
        });
        this.callMap.delete(CallSid);
    }

    /**
     * Handle an outbound SMS status callback from Twilio. Payload:
     *   { MessageSid, MessageStatus, ErrorCode?, ErrorMessage? }
     * Updates the local row and broadcasts a `message.status` event so the
     * UI can update the bubble indicator (delivered / failed / etc).
     */
    handleMessageStatus(payload) {
        const { MessageSid, MessageStatus } = payload;
        if (!MessageSid || !MessageStatus) {
            logError('WebhookService', 'handleMessageStatus: missing MessageSid/MessageStatus');
            return;
        }

        const updated = this.messagesRepo.updateMessageStatus(MessageSid, MessageStatus);
        if (!updated) {
            logOut('WebhookService', `Status callback for unknown ${MessageSid} (${MessageStatus}) — ignored`);
            return;
        }

        logOut('WebhookService', `Status ${MessageSid} → ${MessageStatus}`);
        if (this.sseService) {
            this.sseService.broadcast(updated.userGuid, 'message.status', {
                messageSid: updated.messageSid,
                threadId: updated.threadId,
                remoteAddress: updated.remoteAddress,
                status: updated.status
            });
        }
    }

    /**
     * Handle an inbound SMS posted by Twilio to the per-number smsUrl.
     * Payload is Twilio's standard form-encoded SMS shape:
     *   { From, To, Body, MessageSid, ... }
     *
     * Find/create the thread, persist the message (idempotent on MessageSid),
     * log a Message activity on first message, and broadcast over SSE.
     */
    handleInboundSms(payload) {
        const { From, To, Body, MessageSid } = payload;

        if (!From || !To || !MessageSid) {
            logError('WebhookService', 'handleInboundSms: missing From/To/MessageSid');
            return;
        }

        const owner = this.userService.getUserByTwilioNumber(To);
        if (!owner) {
            logError('WebhookService', `Inbound SMS ${MessageSid} for unowned number ${To}`);
            return;
        }
        const userGuid = owner.userGUID;

        const thread = this.messagingService.ensureThread({
            userGuid,
            remoteAddress: From
        });

        const datetime = new Date().toISOString();
        const inserted = this.messagesRepo.insertMessageIfAbsent({
            messageSid: MessageSid,
            threadId: thread.threadId,
            direction: 'inbound',
            author: From,
            body: Body,
            datetime,
            index: null
        });

        if (!inserted) {
            logOut('WebhookService', `Duplicate inbound ${MessageSid} ignored`);
            return;
        }

        if (!thread.activityId) {
            const activity = this.contactService.addActivity(userGuid, {
                type: 'Message',
                datetime,
                duration: 0,
                identityValue: thread.remoteAddress,
                contactGuid: thread.contactGuid
            });
            this.messagesRepo.setThreadActivity(thread.threadId, activity.id);
        }

        if (this.sseService) {
            this.sseService.broadcast(userGuid, 'message.added', {
                messageSid: MessageSid,
                threadId: thread.threadId,
                remoteAddress: thread.remoteAddress,
                proxyAddress: thread.proxyAddress,
                contactGuid: thread.contactGuid,
                direction: 'inbound',
                author: From,
                body: Body,
                datetime
            });
        }
    }
}

module.exports = { WebhookService };
