const { v4: uuidv4 } = require('uuid');
const { logOut, logError } = require('../utils/logger');

class WebhookService {
    constructor(contactService, sseService = null) {
        this.contactService = contactService;
        this.sseService = sseService;
        this.callMap = new Map();
        this.messageMap = new Map();
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

    registerMessage({ userGuid, to, channel, contactGuid }) {
        const messageSid = `STUB-MSG-${uuidv4()}`;
        this.messageMap.set(messageSid, {
            userGuid,
            to,
            channel,
            contactGuid: contactGuid || null
        });
        logOut('WebhookService', `Registered ${channel} message ${messageSid} for user ${userGuid} → ${to}`);
        return messageSid;
    }

    /**
     * Dispatch a voice status webhook payload.
     * Expected shape (matches Twilio): { CallSid, CallStatus, CallDuration }
     * Only 'completed' triggers activity creation.
     */
    handleVoiceStatus(payload) {
        const { CallSid, CallStatus, CallDuration } = payload;
        const mapping = this.callMap.get(CallSid);

        if (!mapping) {
            logError('WebhookService', `Voice webhook for unknown CallSid: ${CallSid}`);
            return;
        }

        logOut('WebhookService', `Voice status for ${CallSid}: ${CallStatus}`);

        if (CallStatus === 'completed') {
            const durationSeconds = parseInt(CallDuration, 10) || Math.round((Date.now() - mapping.startedAt) / 1000);
            const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));

            this.contactService.addActivity(mapping.userGuid, {
                type: 'Phone',
                datetime: new Date().toISOString(),
                duration: durationMinutes,
                identityValue: mapping.to,
                contactGuid: mapping.contactGuid
            });
            this.callMap.delete(CallSid);
        }
    }

    /**
     * Dispatch a messaging status webhook payload.
     * Expected shape (matches Twilio): { MessageSid, MessageStatus }
     * Only 'delivered' (or 'sent' as a fallback) triggers activity creation.
     */
    handleMessageStatus(payload) {
        const { MessageSid, MessageStatus } = payload;
        const mapping = this.messageMap.get(MessageSid);

        if (!mapping) {
            logError('WebhookService', `Message webhook for unknown MessageSid: ${MessageSid}`);
            return;
        }

        logOut('WebhookService', `Message status for ${MessageSid}: ${MessageStatus}`);

        if (MessageStatus === 'delivered' || MessageStatus === 'sent') {
            const activityType = mapping.channel === 'whatsapp' ? 'WhatsApp' : 'Message';

            this.contactService.addActivity(mapping.userGuid, {
                type: activityType,
                datetime: new Date().toISOString(),
                duration: 0,
                identityValue: mapping.to,
                contactGuid: mapping.contactGuid
            });
            this.messageMap.delete(MessageSid);
        }
    }

    /**
     * Stub helper: simulate a messaging webhook firing after a delay.
     * Voice no longer needs a simulator — the real Twilio Device drives call flow end-to-end.
     */
    simulateMessageDelivered(messageSid, delayMs = 500) {
        setTimeout(() => {
            this.handleMessageStatus({ MessageSid: messageSid, MessageStatus: 'delivered' });
        }, delayMs);
    }
}

module.exports = { WebhookService };
