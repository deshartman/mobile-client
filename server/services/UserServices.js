/**
 * User account CRUD, backed by SQLite.
 *
 * Public API is unchanged from the previous in-memory version:
 * - getUser(userGUID) → user object or undefined
 * - getUserByEmail(email) → { userGUID, userData } or null
 * - getUserByTwilioNumber(e164) → { userGUID, userData } or null
 * - createUser(userData) → userGUID
 * - updateUser(userGUID, patch) → patched user object
 * - deleteUser(userGUID) → userGUID
 */
const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/database');
const { logOut } = require('../utils/logger');

const rowToUser = (row) => {
    if (!row) return undefined;
    return {
        name: row.name,
        email: row.email,
        twilioNumber: row.twilio_number || null,
        active: !!row.active,
        created: row.created
    };
};

class UserService extends EventEmitter {
    constructor() {
        super();

        this._getByGuid = db.prepare('SELECT * FROM users WHERE user_guid = ?');
        this._getByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
        this._getByTwilioNumber = db.prepare('SELECT * FROM users WHERE twilio_number = ?');
        this._insert = db.prepare(
            'INSERT INTO users (user_guid, name, email, twilio_number, active, created) VALUES (?, ?, ?, ?, ?, ?)'
        );
        this._delete = db.prepare('DELETE FROM users WHERE user_guid = ?');
    }

    createUser(userData) {
        const guid = uuidv4();
        const created = new Date().toISOString();
        this._insert.run(
            guid,
            userData.name,
            userData.email,
            userData.twilioNumber || null,
            userData.active === false ? 0 : 1,
            userData.created || created
        );
        logOut('User Service', `Created user: ${guid} (${userData.email})`);
        return guid;
    }

    getUser(userGUID) {
        logOut('User Service', `Getting user ${userGUID}`);
        return rowToUser(this._getByGuid.get(userGUID));
    }

    getUserByEmail(email) {
        logOut('User Service', `Getting user by email: ${email}`);
        const row = this._getByEmail.get(email);
        if (!row) {
            logOut('User Service', `No user found for email: ${email}`);
            return null;
        }
        logOut('User Service', `Found existing user for email ${email}: ${row.user_guid}`);
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
            email: patch.email ?? existing.email,
            twilio_number: patch.twilioNumber !== undefined ? patch.twilioNumber : existing.twilio_number,
            active,
            created: existing.created
        };

        db.prepare(
            'UPDATE users SET name = ?, email = ?, twilio_number = ?, active = ? WHERE user_guid = ?'
        ).run(merged.name, merged.email, merged.twilio_number, merged.active, userGUID);

        return rowToUser(this._getByGuid.get(userGUID));
    }

    deleteUser(userGUID) {
        this._delete.run(userGUID);
        return userGUID;
    }
}

module.exports = { UserService };
