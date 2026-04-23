const { v4: uuidv4 } = require('uuid');
const { logOut, logError } = require('../utils/logger');

class WebhookService {
    constructor(contactService) {
        this.contactService = contactService;
        this.callMap = new Map();
        this.messageMap = new Map();
    }

    registerCall({ userGuid, to, contactGuid }) {
        const callSid = `STUB-CALL-${uuidv4()}`;
        this.callMap.set(callSid, {
            userGuid,
            to,
            contactGuid: contactGuid || null,
            startedAt: Date.now()
        });
        logOut('WebhookService', `Registered call ${callSid} for user ${userGuid} → ${to}`);
        return callSid;
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
     * Stub helper: simulate a Twilio webhook firing after a delay.
     * Real Twilio fires the webhook on its own; this stands in during development.
     */
    simulateVoiceCompletion(callSid, delayMs = 500) {
        setTimeout(() => {
            this.handleVoiceStatus({ CallSid: callSid, CallStatus: 'completed', CallDuration: '60' });
        }, delayMs);
    }

    simulateMessageDelivered(messageSid, delayMs = 500) {
        setTimeout(() => {
            this.handleMessageStatus({ MessageSid: messageSid, MessageStatus: 'delivered' });
        }, delayMs);
    }
}

module.exports = { WebhookService };
