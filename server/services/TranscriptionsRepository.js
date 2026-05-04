/**
 * Persistence for real-time call transcriptions.
 *
 * One row per final utterance. Keyed by (call_sid, sequence_id) — a composite
 * PK that gives idempotency for Twilio webhook retries for free via
 * INSERT OR IGNORE.
 *
 * `track` is Twilio's label: 'inbound_track' = the remote caller,
 * 'outbound_track' = our user. Rendered as left/right bubbles respectively.
 */
const { db } = require('../db/database');

const rowToUtterance = (row) => ({
    callSid: row.call_sid,
    sequenceId: row.sequence_id,
    track: row.track,
    transcript: row.transcript,
    confidence: row.confidence,
    datetime: row.datetime
});

class TranscriptionsRepository {
    constructor() {
        this._insert = db.prepare(
            `INSERT OR IGNORE INTO transcriptions
                (call_sid, sequence_id, track, transcript, confidence, datetime)
             VALUES (?, ?, ?, ?, ?, ?)`
        );
        this._selectByCallSid = db.prepare(
            'SELECT * FROM transcriptions WHERE call_sid = ? ORDER BY sequence_id ASC'
        );
    }

    /**
     * Returns true if a new row was inserted, false if the (call_sid, sequence_id)
     * pair already existed (webhook retry).
     */
    insertIfAbsent({ callSid, sequenceId, track, transcript, confidence, datetime }) {
        const result = this._insert.run(
            callSid,
            sequenceId,
            track,
            transcript,
            confidence ?? null,
            datetime || new Date().toISOString()
        );
        return result.changes > 0;
    }

    getByCallSid(callSid) {
        if (!callSid) return [];
        return this._selectByCallSid.all(callSid).map(rowToUtterance);
    }
}

module.exports = { TranscriptionsRepository };
