/**
 * Persistence for Twilio Conversations (threads) and their messages.
 *
 * Webhooks are the source of truth: every inbound and outbound message lands
 * here via the onMessageAdded event. `insertMessageIfAbsent` uses INSERT OR
 * IGNORE on the Twilio MessageSid PK so Twilio retries are idempotent.
 */
const { db } = require('../db/database');

const rowToConversation = (row) => {
    if (!row) return undefined;
    return {
        conversationSid: row.conversation_sid,
        userGuid: row.user_guid,
        contactGuid: row.contact_guid,
        remoteAddress: row.remote_address,
        proxyAddress: row.proxy_address,
        activityId: row.activity_id,
        created: row.created
    };
};

const rowToMessage = (row) => ({
    messageSid: row.message_sid,
    conversationSid: row.conversation_sid,
    direction: row.direction,
    author: row.author,
    body: row.body,
    datetime: row.datetime,
    index: row.idx
});

class MessagesRepository {
    constructor() {
        this._selectConversationBySid = db.prepare(
            'SELECT * FROM conversations WHERE conversation_sid = ?'
        );
        this._selectConversationByPair = db.prepare(
            'SELECT * FROM conversations WHERE user_guid = ? AND proxy_address = ? AND remote_address = ?'
        );
        this._selectConversationByUserAndRemote = db.prepare(
            'SELECT * FROM conversations WHERE user_guid = ? AND remote_address = ? ORDER BY created DESC LIMIT 1'
        );
        this._insertConversation = db.prepare(
            `INSERT INTO conversations
                (conversation_sid, user_guid, contact_guid, remote_address, proxy_address, activity_id, created)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
        );
        this._updateConversationActivity = db.prepare(
            'UPDATE conversations SET activity_id = ? WHERE conversation_sid = ?'
        );
        this._updateConversationContact = db.prepare(
            'UPDATE conversations SET contact_guid = ? WHERE conversation_sid = ?'
        );

        this._insertMessage = db.prepare(
            `INSERT OR IGNORE INTO messages
                (message_sid, conversation_sid, direction, author, body, datetime, idx)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
        );
        this._selectMessagesForConversation = db.prepare(
            'SELECT * FROM messages WHERE conversation_sid = ? ORDER BY datetime ASC, idx ASC'
        );
    }

    findConversationBySid(conversationSid) {
        return rowToConversation(this._selectConversationBySid.get(conversationSid));
    }

    findConversationByPair(userGuid, proxyAddress, remoteAddress) {
        return rowToConversation(this._selectConversationByPair.get(userGuid, proxyAddress, remoteAddress));
    }

    findConversationByUserAndRemote(userGuid, remoteAddress) {
        return rowToConversation(this._selectConversationByUserAndRemote.get(userGuid, remoteAddress));
    }

    insertConversation({ conversationSid, userGuid, contactGuid, remoteAddress, proxyAddress, activityId }) {
        this._insertConversation.run(
            conversationSid,
            userGuid,
            contactGuid || null,
            remoteAddress,
            proxyAddress,
            activityId || null,
            new Date().toISOString()
        );
        return this.findConversationBySid(conversationSid);
    }

    setConversationActivity(conversationSid, activityId) {
        this._updateConversationActivity.run(activityId, conversationSid);
    }

    setConversationContact(conversationSid, contactGuid) {
        this._updateConversationContact.run(contactGuid || null, conversationSid);
    }

    /**
     * INSERT OR IGNORE — returns true if the row was newly inserted, false if
     * a row with the same MessageSid already existed (webhook replay).
     */
    insertMessageIfAbsent({ messageSid, conversationSid, direction, author, body, datetime, index }) {
        const result = this._insertMessage.run(
            messageSid,
            conversationSid,
            direction,
            author || null,
            body || null,
            datetime || new Date().toISOString(),
            index ?? null
        );
        return result.changes > 0;
    }

    getMessages(conversationSid) {
        return this._selectMessagesForConversation.all(conversationSid).map(rowToMessage);
    }
}

module.exports = { MessagesRepository };
