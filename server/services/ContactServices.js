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
            'INSERT INTO contacts (contact_guid, user_guid, first_name, last_name, company) VALUES (?, ?, ?, ?, ?)'
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
            'UPDATE contacts SET first_name = ?, last_name = ?, company = ? WHERE user_guid = ? AND contact_guid = ?'
        );

        this._selectActivitiesForUser = db.prepare(
            'SELECT * FROM activities WHERE user_guid = ? ORDER BY datetime DESC'
        );
        this._selectActivitiesForUserAndContact = db.prepare(
            'SELECT * FROM activities WHERE user_guid = ? AND contact_guid = ? ORDER BY datetime DESC'
        );
        this._insertActivity = db.prepare(
            'INSERT INTO activities (id, user_guid, type, datetime, duration, identity_value, contact_guid) VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
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

    getContact(userGUID, contactGUID) {
        return this._contactFor(userGUID, contactGUID);
    }

    createContact(userGUID, contact) {
        const guid = contact.guid || `contact-${Date.now()}`;
        const identities = Array.isArray(contact.identities) ? contact.identities : [];

        const tx = db.transaction(() => {
            this._insertContact.run(guid, userGUID, contact.firstName || null, contact.lastName || null, contact.company || null);
            identities.forEach(i => this._insertIdentity.run(guid, i.type, i.value));
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
                userGUID,
                contactGUID
            );
            if (identities !== null) {
                this._deleteIdentitiesForContact.run(contactGUID);
                identities.forEach(i => this._insertIdentity.run(contactGUID, i.type, i.value));
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

    getActivities(userGUID, contactGuid) {
        const rows = contactGuid
            ? this._selectActivitiesForUserAndContact.all(userGUID, contactGuid)
            : this._selectActivitiesForUser.all(userGUID);
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
