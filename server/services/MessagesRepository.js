/**
 * Persistence for SMS threads and their messages.
 *
 * A thread is the (user_guid, proxy_address, remote_address) tuple — i.e. a
 * conversation between one of our users (via their Twilio number) and a remote
 * phone number. Each thread has a locally-generated `thr_<uuid>` id.
 *
 * Messages are keyed by Twilio's SMS MessageSid (SMxxx). `insertMessageIfAbsent`
 * uses INSERT OR IGNORE so Twilio webhook retries are idempotent.
 */
const { randomUUID } = require('crypto');
const { db } = require('../db/database');

const rowToThread = (row) => {
    if (!row) return undefined;
    return {
        threadId: row.thread_id,
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
    threadId: row.thread_id,
    direction: row.direction,
    author: row.author,
    body: row.body,
    datetime: row.datetime,
    index: row.idx,
    status: row.status
});

class MessagesRepository {
    constructor() {
        this._selectThreadById = db.prepare(
            'SELECT * FROM threads WHERE thread_id = ?'
        );
        this._selectThreadByPair = db.prepare(
            'SELECT * FROM threads WHERE user_guid = ? AND proxy_address = ? AND remote_address = ?'
        );
        this._selectThreadByUserAndRemote = db.prepare(
            'SELECT * FROM threads WHERE user_guid = ? AND remote_address = ? ORDER BY created DESC LIMIT 1'
        );
        this._insertThread = db.prepare(
            `INSERT INTO threads
                (thread_id, user_guid, contact_guid, remote_address, proxy_address, activity_id, created)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
        );
        this._updateThreadActivity = db.prepare(
            'UPDATE threads SET activity_id = ? WHERE thread_id = ?'
        );
        this._updateThreadContact = db.prepare(
            'UPDATE threads SET contact_guid = ? WHERE thread_id = ?'
        );

        this._insertMessage = db.prepare(
            `INSERT OR IGNORE INTO messages
                (message_sid, thread_id, direction, author, body, datetime, idx, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        );
        this._selectMessagesForThread = db.prepare(
            'SELECT * FROM messages WHERE thread_id = ? ORDER BY datetime ASC, idx ASC'
        );
        this._updateMessageStatus = db.prepare(
            'UPDATE messages SET status = ? WHERE message_sid = ?'
        );
        this._selectMessageBySid = db.prepare(
            'SELECT m.*, t.user_guid, t.remote_address, t.proxy_address, t.contact_guid FROM messages m JOIN threads t ON t.thread_id = m.thread_id WHERE m.message_sid = ?'
        );
    }

    findThreadById(threadId) {
        return rowToThread(this._selectThreadById.get(threadId));
    }

    findThreadByPair(userGuid, proxyAddress, remoteAddress) {
        return rowToThread(this._selectThreadByPair.get(userGuid, proxyAddress, remoteAddress));
    }

    findThreadByUserAndRemote(userGuid, remoteAddress) {
        return rowToThread(this._selectThreadByUserAndRemote.get(userGuid, remoteAddress));
    }

    insertThread({ userGuid, contactGuid, remoteAddress, proxyAddress, activityId }) {
        const threadId = `thr_${randomUUID()}`;
        this._insertThread.run(
            threadId,
            userGuid,
            contactGuid || null,
            remoteAddress,
            proxyAddress,
            activityId || null,
            new Date().toISOString()
        );
        return this.findThreadById(threadId);
    }

    setThreadActivity(threadId, activityId) {
        this._updateThreadActivity.run(activityId, threadId);
    }

    setThreadContact(threadId, contactGuid) {
        this._updateThreadContact.run(contactGuid || null, threadId);
    }

    /**
     * INSERT OR IGNORE — returns true if the row was newly inserted, false if
     * a row with the same MessageSid already existed (webhook replay).
     */
    insertMessageIfAbsent({ messageSid, threadId, direction, author, body, datetime, index, status }) {
        const result = this._insertMessage.run(
            messageSid,
            threadId,
            direction,
            author || null,
            body || null,
            datetime || new Date().toISOString(),
            index ?? null,
            status || null
        );
        return result.changes > 0;
    }

    getMessages(threadId) {
        return this._selectMessagesForThread.all(threadId).map(rowToMessage);
    }

    /**
     * Update the delivery status for an outbound message. Returns the enriched
     * row (message + its thread) so the webhook handler can broadcast via SSE,
     * or null if the SID is unknown (e.g. status callback for a message we
     * didn't record — shouldn't happen, but be defensive).
     */
    updateMessageStatus(messageSid, status) {
        const result = this._updateMessageStatus.run(status, messageSid);
        if (result.changes === 0) return null;
        const row = this._selectMessageBySid.get(messageSid);
        if (!row) return null;
        return {
            messageSid: row.message_sid,
            threadId: row.thread_id,
            userGuid: row.user_guid,
            remoteAddress: row.remote_address,
            proxyAddress: row.proxy_address,
            contactGuid: row.contact_guid,
            direction: row.direction,
            author: row.author,
            body: row.body,
            datetime: row.datetime,
            status: row.status
        };
    }
}

module.exports = { MessagesRepository };
