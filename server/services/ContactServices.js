/**
 * Contacts + activities service, backed by SQLite.
 *
 * Public API preserved:
 * - getContacts(userGUID) → Array of contacts (was: Map; callsite updated)
 * - getContact(userGUID, contactGUID) → contact or undefined
 * - createContact(userGUID, contact) → created contact (emits 'contactCreated')
 * - updateContact(userGUID, contactGUID, contact) → contactGUID (emits 'contactUpdated')
 * - deleteContact(userGUID, contactGUID) → boolean (emits 'contactDeleted')
 * - getActivities(userGUID) → enriched activity array (most recent first)
 * - addActivity(userGUID, activity) → activity (emits 'activityAdded' with enriched payload)
 * - getMainListRows(userGUID) → rows for the main screen: contacts + unknown-identity
 *   groups, ordered by last-interacted-at DESC then alphabetical for contacts with
 *   no interactions.
 */
const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/database');

const rowToContact = (row, identities) => {
    if (!row) return undefined;
    return {
        guid: row.contact_guid,
        firstName: row.first_name,
        lastName: row.last_name,
        company: row.company,
        photoData: row.photo_data || null,
        identities: identities || []
    };
};

class ContactService extends EventEmitter {
    constructor() {
        super();

        this._selectContactsForUser = db.prepare(
            'SELECT * FROM contacts WHERE user_guid = ? ORDER BY first_name, last_name'
        );
        this._selectContact = db.prepare(
            'SELECT * FROM contacts WHERE user_guid = ? AND contact_guid = ?'
        );
        this._selectIdentitiesForContact = db.prepare(
            'SELECT type, value FROM contact_identities WHERE contact_guid = ? ORDER BY id'
        );
        this._insertContact = db.prepare(
            'INSERT INTO contacts (contact_guid, user_guid, first_name, last_name, company, photo_data) VALUES (?, ?, ?, ?, ?, ?)'
        );
        this._deleteContact = db.prepare(
            'DELETE FROM contacts WHERE user_guid = ? AND contact_guid = ?'
        );
        this._insertIdentity = db.prepare(
            'INSERT INTO contact_identities (contact_guid, type, value) VALUES (?, ?, ?)'
        );
        this._deleteIdentitiesForContact = db.prepare(
            'DELETE FROM contact_identities WHERE contact_guid = ?'
        );
        this._updateContactFields = db.prepare(
            'UPDATE contacts SET first_name = ?, last_name = ?, company = ?, photo_data = ? WHERE user_guid = ? AND contact_guid = ?'
        );

        this._selectActivitiesForUser = db.prepare(
            'SELECT * FROM activities WHERE user_guid = ? ORDER BY datetime DESC'
        );
        this._selectMainListRows = db.prepare(`
            SELECT 'contact' AS kind,
                   c.contact_guid AS guid,
                   c.first_name, c.last_name, c.company, c.photo_data,
                   NULL AS identity_value,
                   la.last_interacted_at
            FROM contacts c
            LEFT JOIN (
                SELECT contact_guid, MAX(datetime) AS last_interacted_at
                FROM activities
                WHERE user_guid = ? AND contact_guid IS NOT NULL
                GROUP BY contact_guid
            ) la ON la.contact_guid = c.contact_guid
            WHERE c.user_guid = ?

            UNION ALL

            SELECT 'unknown' AS kind,
                   NULL, NULL, NULL, NULL, NULL,
                   identity_value,
                   MAX(datetime) AS last_interacted_at
            FROM activities
            WHERE user_guid = ? AND contact_guid IS NULL AND identity_value IS NOT NULL
            GROUP BY identity_value

            ORDER BY last_interacted_at DESC NULLS LAST,
                     first_name COLLATE NOCASE,
                     last_name COLLATE NOCASE
        `);
        this._selectActivitiesForUserAndContact = db.prepare(
            'SELECT * FROM activities WHERE user_guid = ? AND contact_guid = ? ORDER BY datetime DESC'
        );
        this._selectActivitiesForUserAndIdentity = db.prepare(
            'SELECT * FROM activities WHERE user_guid = ? AND contact_guid IS NULL AND identity_value = ? ORDER BY datetime DESC'
        );
        this._insertActivity = db.prepare(
            'INSERT INTO activities (id, user_guid, type, datetime, duration, identity_value, contact_guid) VALUES (?, ?, ?, ?, ?, ?, ?)'
        );

        // Back-linking unknown-identity activities/threads to a newly-created (or
        // edited) contact. Normalise to digits so "+1 (555) 111-2222" matches
        // "+15551112222". Only rewrites rows where contact_guid IS NULL so an
        // existing link to another contact is never clobbered.
        this._selectUnlinkedActivitiesByUser = db.prepare(
            "SELECT id, identity_value FROM activities WHERE user_guid = ? AND contact_guid IS NULL AND identity_value IS NOT NULL"
        );
        this._linkActivityToContact = db.prepare(
            'UPDATE activities SET contact_guid = ? WHERE id = ? AND contact_guid IS NULL'
        );
        this._selectUnlinkedThreadsByUser = db.prepare(
            "SELECT thread_id, remote_address FROM threads WHERE user_guid = ? AND contact_guid IS NULL"
        );
        this._linkThreadToContact = db.prepare(
            'UPDATE threads SET contact_guid = ? WHERE thread_id = ? AND contact_guid IS NULL'
        );
    }

    /**
     * After a contact is created or edited, match any unknown-identity
     * activities + threads for this user whose identifier normalises to one
     * of the contact's phone identities, and link them to the new contact.
     * Runs in the caller's transaction.
     */
    _backlinkUnlinked(userGUID, contactGUID, identities) {
        const toDigits = (s) => (s || '').replace(/\D/g, '');
        const targetDigits = new Set(
            (identities || [])
                .map(i => toDigits(i.value))
                .filter(d => d.length > 0)
        );
        if (targetDigits.size === 0) return;

        const activities = this._selectUnlinkedActivitiesByUser.all(userGUID);
        for (const a of activities) {
            if (targetDigits.has(toDigits(a.identity_value))) {
                this._linkActivityToContact.run(contactGUID, a.id);
            }
        }

        const threads = this._selectUnlinkedThreadsByUser.all(userGUID);
        for (const t of threads) {
            if (targetDigits.has(toDigits(t.remote_address))) {
                this._linkThreadToContact.run(contactGUID, t.thread_id);
            }
        }
    }

    _identitiesFor(contactGuid) {
        return this._selectIdentitiesForContact.all(contactGuid).map(r => ({ type: r.type, value: r.value }));
    }

    _contactFor(userGuid, contactGuid) {
        const row = this._selectContact.get(userGuid, contactGuid);
        if (!row) return undefined;
        return rowToContact(row, this._identitiesFor(contactGuid));
    }

    getContacts(userGUID) {
        const rows = this._selectContactsForUser.all(userGUID);
        return rows.map(r => rowToContact(r, this._identitiesFor(r.contact_guid)));
    }

    getMainListRows(userGUID) {
        const rows = this._selectMainListRows.all(userGUID, userGUID, userGUID);
        return rows.map(r => {
            if (r.kind === 'contact') {
                return {
                    kind: 'contact',
                    guid: r.guid,
                    firstName: r.first_name,
                    lastName: r.last_name,
                    company: r.company,
                    photoData: r.photo_data || null,
                    identities: this._identitiesFor(r.guid),
                    identityValue: null,
                    lastInteractedAt: r.last_interacted_at || null
                };
            }
            return {
                kind: 'unknown',
                guid: null,
                firstName: null,
                lastName: null,
                company: null,
                photoData: null,
                identities: [],
                identityValue: r.identity_value,
                lastInteractedAt: r.last_interacted_at || null
            };
        });
    }

    getContact(userGUID, contactGUID) {
        return this._contactFor(userGUID, contactGUID);
    }

    createContact(userGUID, contact) {
        const guid = contact.guid || `contact-${Date.now()}`;
        const identities = Array.isArray(contact.identities) ? contact.identities : [];

        const tx = db.transaction(() => {
            this._insertContact.run(
                guid,
                userGUID,
                contact.firstName || null,
                contact.lastName || null,
                contact.company || null,
                contact.photoData || null
            );
            identities.forEach(i => this._insertIdentity.run(guid, i.type, i.value));
            this._backlinkUnlinked(userGUID, guid, identities);
        });
        tx();

        const created = this._contactFor(userGUID, guid);
        this.emit('contactCreated', created);
        return created;
    }

    updateContact(userGUID, contactGUID, contact) {
        const existing = this._selectContact.get(userGUID, contactGUID);
        if (!existing) {
            throw new Error('Contact not found');
        }

        const identities = Array.isArray(contact.identities) ? contact.identities : null;

        const tx = db.transaction(() => {
            this._updateContactFields.run(
                contact.firstName ?? existing.first_name,
                contact.lastName ?? existing.last_name,
                contact.company ?? existing.company,
                contact.photoData !== undefined ? contact.photoData : existing.photo_data,
                userGUID,
                contactGUID
            );
            if (identities !== null) {
                this._deleteIdentitiesForContact.run(contactGUID);
                identities.forEach(i => this._insertIdentity.run(contactGUID, i.type, i.value));
                this._backlinkUnlinked(userGUID, contactGUID, identities);
            }
        });
        tx();

        this.emit('contactUpdated', contactGUID);
        return contactGUID;
    }

    deleteContact(userGUID, contactGUID) {
        const result = this._deleteContact.run(userGUID, contactGUID);
        const deleted = result.changes > 0;
        if (deleted) {
            this.emit('contactDeleted', contactGUID);
        }
        return deleted;
    }

    getActivities(userGUID, filter) {
        // filter can be a contact guid string (legacy), or an object
        // { contactGuid } or { identityValue } for unknown-number grouping.
        let rows;
        const contactGuid = typeof filter === 'string' ? filter : filter?.contactGuid;
        const identityValue = typeof filter === 'object' ? filter?.identityValue : null;
        if (contactGuid) {
            rows = this._selectActivitiesForUserAndContact.all(userGUID, contactGuid);
        } else if (identityValue) {
            rows = this._selectActivitiesForUserAndIdentity.all(userGUID, identityValue);
        } else {
            rows = this._selectActivitiesForUser.all(userGUID);
        }
        return rows.map(r => ({
            id: r.id,
            type: r.type,
            datetime: r.datetime,
            duration: r.duration,
            identityValue: r.identity_value,
            contactGuid: r.contact_guid,
            contact: r.contact_guid ? (this._contactFor(userGUID, r.contact_guid) || null) : null
        }));
    }

    addActivity(userGUID, activity) {
        const id = activity.id || uuidv4();
        const datetime = activity.datetime || new Date().toISOString();
        const duration = activity.duration ?? 0;
        const contactGuid = activity.contactGuid || null;

        this._insertActivity.run(
            id,
            userGUID,
            activity.type,
            datetime,
            duration,
            activity.identityValue || null,
            contactGuid
        );

        const stored = {
            id,
            type: activity.type,
            datetime,
            duration,
            identityValue: activity.identityValue || null,
            contactGuid
        };
        const enriched = {
            ...stored,
            contact: contactGuid ? (this._contactFor(userGUID, contactGuid) || null) : null
        };

        this.emit('activityAdded', { userGuid: userGUID, activity: enriched });
        return stored;
    }
}

module.exports = { ContactService };
