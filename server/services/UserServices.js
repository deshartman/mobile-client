/**
 * User account CRUD, backed by SQLite.
 */
const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/database');
const { logOut } = require('../utils/logger');

const rowToUser = (row) => {
    if (!row) return undefined;
    return {
        name: row.name,
        phone: row.phone || null,
        email: row.email || null,
        twilioNumber: row.twilio_number || null,
        active: !!row.active,
        created: row.created
    };
};

class UserService extends EventEmitter {
    constructor() {
        super();

        this._getByGuid = db.prepare('SELECT * FROM users WHERE user_guid = ?');
        this._getByPhone = db.prepare('SELECT * FROM users WHERE phone = ?');
        this._getByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
        this._getByTwilioNumber = db.prepare('SELECT * FROM users WHERE twilio_number = ?');
        this._insert = db.prepare(
            'INSERT INTO users (user_guid, name, phone, email, twilio_number, active, created) VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        this._delete = db.prepare('DELETE FROM users WHERE user_guid = ?');
    }

    createUser(userData) {
        const guid = uuidv4();
        const created = new Date().toISOString();
        this._insert.run(
            guid,
            userData.name,
            userData.phone || null,
            userData.email || null,
            userData.twilioNumber || null,
            userData.active === false ? 0 : 1,
            userData.created || created
        );
        logOut('User Service', `Created user: ${guid} (phone=${userData.phone || 'n/a'}, email=${userData.email || 'n/a'})`);
        return guid;
    }

    getUser(userGUID) {
        logOut('User Service', `Getting user ${userGUID}`);
        return rowToUser(this._getByGuid.get(userGUID));
    }

    getUserByPhone(phone) {
        if (!phone) return null;
        logOut('User Service', `Getting user by phone: ${phone}`);
        const row = this._getByPhone.get(phone);
        if (!row) return null;
        return { userGUID: row.user_guid, userData: rowToUser(row) };
    }

    getUserByEmail(email) {
        if (!email) return null;
        logOut('User Service', `Getting user by email: ${email}`);
        const row = this._getByEmail.get(email);
        if (!row) return null;
        return { userGUID: row.user_guid, userData: rowToUser(row) };
    }

    getUserByTwilioNumber(e164Number) {
        if (!e164Number) return null;
        logOut('User Service', `Getting user by Twilio number: ${e164Number}`);
        const row = this._getByTwilioNumber.get(e164Number);
        if (!row) return null;
        return { userGUID: row.user_guid, userData: rowToUser(row) };
    }

    updateUser(userGUID, patch) {
        const existing = this._getByGuid.get(userGUID);
        if (!existing) {
            throw new Error('User not found');
        }

        let active = existing.active;
        if (patch.active !== undefined) {
            active = patch.active ? 1 : 0;
        }
        const merged = {
            name: patch.name ?? existing.name,
            phone: patch.phone !== undefined ? patch.phone : existing.phone,
            email: patch.email !== undefined ? patch.email : existing.email,
            twilio_number: patch.twilioNumber !== undefined ? patch.twilioNumber : existing.twilio_number,
            active,
            created: existing.created
        };

        db.prepare(
            'UPDATE users SET name = ?, phone = ?, email = ?, twilio_number = ?, active = ? WHERE user_guid = ?'
        ).run(merged.name, merged.phone, merged.email, merged.twilio_number, merged.active, userGUID);

        return rowToUser(this._getByGuid.get(userGUID));
    }

    deleteUser(userGUID) {
        this._delete.run(userGUID);
        return userGUID;
    }
}

module.exports = { UserService };
