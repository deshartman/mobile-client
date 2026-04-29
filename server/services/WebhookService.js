const { logOut, logError } = require('../utils/logger');

class WebhookService {
    constructor({ contactService, userService, sseService, messagesRepo, conversationsService }) {
        this.contactService = contactService;
        this.userService = userService;
        this.sseService = sseService;
        this.messagesRepo = messagesRepo;
        this.conversationsService = conversationsService;
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
     * Dispatch a Twilio Conversations post-event webhook payload.
     *
     * Expected events on the default chat service webhook URL:
     *   - onConversationAdded : autocreate from inbound SMS, or the server's own create
     *   - onParticipantAdded  : SMS participant binding info (log only)
     *   - onMessageAdded      : both inbound and outbound — the canonical write path
     *
     * Payload fields follow Twilio's post-event convention: PascalCase with dotted
     * keys flattened, e.g. `MessagingBinding.ProxyAddress`.
     */
    handleConversationsWebhook(payload) {
        const eventType = payload.EventType;
        logOut('WebhookService', `Conversations webhook: ${eventType}`);

        switch (eventType) {
            case 'onConversationAdded':
                this._handleConversationAdded(payload);
                return;
            case 'onParticipantAdded':
                this._handleParticipantAdded(payload);
                return;
            case 'onMessageAdded':
                this._handleMessageAdded(payload);
                return;
            default:
                // Other events (onMessageUpdated, onConversationStateUpdated, …) are not consumed yet.
                return;
        }
    }

    _handleConversationAdded(payload) {
        const conversationSid = payload.ConversationSid;
        if (!conversationSid) return;

        // If the server created this conversation via sendMessage(), we've already
        // inserted the row. The autocreate-from-inbound path is handled lazily in
        // _handleMessageAdded once we've seen the participant binding.
        const existing = this.messagesRepo.findConversationBySid(conversationSid);
        logOut('WebhookService', `Conversation ${conversationSid} added (known=${!!existing})`);
    }

    _handleParticipantAdded(payload) {
        // Log only — binding info is also available on the message itself via Author.
        const { ConversationSid, ParticipantSid } = payload;
        const proxy = payload['MessagingBinding.ProxyAddress'];
        const addr = payload['MessagingBinding.Address'];
        if (proxy || addr) {
            logOut('WebhookService', `Participant ${ParticipantSid} added to ${ConversationSid} (addr=${addr}, proxy=${proxy})`);
        }
    }

    _handleMessageAdded(payload) {
        const conversationSid = payload.ConversationSid;
        const messageSid = payload.MessageSid;
        if (!conversationSid || !messageSid) {
            logError('WebhookService', 'onMessageAdded missing ConversationSid/MessageSid');
            return;
        }

        let conversation = this.messagesRepo.findConversationBySid(conversationSid);

        // Autocreate path: inbound SMS to a user's Twilio number. The payload for
        // inbound messages carries the author (the remote SMS address) and a
        // ProxyAddress binding we can use to find the owning user.
        if (!conversation) {
            conversation = this._lazyCreateInboundConversation(payload);
            if (!conversation) {
                logError('WebhookService', `onMessageAdded for unknown conversation ${conversationSid} (no user match)`);
                return;
            }
        }

        const author = payload.Author;
        const direction = author === conversation.proxyAddress ? 'outbound' : 'inbound';
        const body = payload.Body;
        const datetime = payload.DateCreated || new Date().toISOString();
        const index = payload.Index == null ? null : parseInt(payload.Index, 10);

        const inserted = this.messagesRepo.insertMessageIfAbsent({
            messageSid,
            conversationSid,
            direction,
            author,
            body,
            datetime,
            index
        });

        if (!inserted) {
            logOut('WebhookService', `Duplicate message ${messageSid} ignored`);
            return;
        }

        // First message in this conversation → log a Message activity once.
        if (!conversation.activityId) {
            const activity = this.contactService.addActivity(conversation.userGuid, {
                type: 'Message',
                datetime,
                duration: 0,
                identityValue: conversation.remoteAddress,
                contactGuid: conversation.contactGuid
            });
            this.messagesRepo.setConversationActivity(conversationSid, activity.id);
            conversation = { ...conversation, activityId: activity.id };
        }

        if (this.sseService) {
            this.sseService.broadcast(conversation.userGuid, 'message.added', {
                messageSid,
                conversationSid,
                remoteAddress: conversation.remoteAddress,
                proxyAddress: conversation.proxyAddress,
                contactGuid: conversation.contactGuid,
                direction,
                author,
                body,
                datetime,
                index
            });
        }
    }

    /**
     * Build a conversations row for an inbound SMS arriving on a user's Twilio
     * number. Only called when onMessageAdded fires for an unknown
     * ConversationSid — the typical autocreate path.
     */
    _lazyCreateInboundConversation(payload) {
        // Inbound SMS webhooks carry the participant binding on the message.
        // Common shape: MessagingBinding.Address (remote) + MessagingBinding.ProxyAddress (our number).
        const proxyAddress = payload['MessagingBinding.ProxyAddress'] || payload.ProxyAddress;
        const remoteAddress = payload['MessagingBinding.Address'] || payload.Author;

        if (!proxyAddress) {
            logError('WebhookService', 'Cannot lazy-create conversation: no MessagingBinding.ProxyAddress on payload');
            return null;
        }

        const owner = this.userService.getUserByTwilioNumber(proxyAddress);
        if (!owner) {
            logError('WebhookService', `Inbound conversation for unowned proxyAddress ${proxyAddress}`);
            return null;
        }

        const userGuid = owner.userGUID;
        const contactGuid = this.conversationsService
            ? this.conversationsService.resolveContactGuid(userGuid, remoteAddress)
            : null;

        logOut('WebhookService', `Lazy-creating conversation row for inbound ${payload.ConversationSid} (${proxyAddress} ← ${remoteAddress})`);

        return this.messagesRepo.insertConversation({
            conversationSid: payload.ConversationSid,
            userGuid,
            contactGuid,
            remoteAddress,
            proxyAddress
        });
    }
}

module.exports = { WebhookService };
