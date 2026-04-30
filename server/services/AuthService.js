/**
 * Phone-OTP signup + signin.
 *
 * Same flow for both: phone → 6-digit SMS OTP → verify → complete.
 * On complete, new phones get a fresh user (requires name); existing phones
 * return the existing userGUID (signin).
 */
const crypto = require('crypto');
const twilio = require('twilio');
const { db } = require('../db/database');
const { logOut, logError } = require('../utils/logger');

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const E164 = /^\+[1-9]\d{7,14}$/;

function hashCode(code) {
    return crypto.createHash('sha256').update(code).digest('hex');
}

function generateCode() {
    // 6 digits, zero-padded, uniform over [0, 1_000_000).
    return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

class AuthService {
    constructor({ userService, twilioNumberService }) {
        this.userService = userService;
        this.twilioNumberService = twilioNumberService;
        this.client = null;

        this._getOtp = db.prepare('SELECT * FROM otp_verifications WHERE phone = ?');
        this._upsertOtp = db.prepare(`
            INSERT INTO otp_verifications (phone, code_hash, attempts, created_at, expires_at, verified)
            VALUES (?, ?, 0, ?, ?, 0)
            ON CONFLICT(phone) DO UPDATE SET
                code_hash = excluded.code_hash,
                attempts = 0,
                created_at = excluded.created_at,
                expires_at = excluded.expires_at,
                verified = 0
        `);
        this._incrementAttempts = db.prepare(
            'UPDATE otp_verifications SET attempts = attempts + 1 WHERE phone = ?'
        );
        this._markVerified = db.prepare(
            'UPDATE otp_verifications SET verified = 1 WHERE phone = ?'
        );
        this._deleteOtp = db.prepare('DELETE FROM otp_verifications WHERE phone = ?');
    }

    /**
     * Lazy-init. Mirrors ConversationsService._getClient so signup only needs
     * Twilio creds when an OTP is actually sent.
     */
    _getClient() {
        if (this.client) return this.client;

        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const messagingServiceSid = process.env.MESSAGING_SERVICE_SID;

        const missing = [];
        if (!accountSid) missing.push('TWILIO_ACCOUNT_SID');
        if (!authToken) missing.push('TWILIO_AUTH_TOKEN');
        if (!messagingServiceSid) missing.push('MESSAGING_SERVICE_SID');

        if (missing.length > 0) {
            logError('AuthService', `Missing required env: ${missing.join(', ')}`);
            throw new Error(`Missing required auth env variables: ${missing.join(', ')}`);
        }

        this.messagingServiceSid = messagingServiceSid;
        this.client = twilio(accountSid, authToken);
        logOut('AuthService', 'Twilio client initialised for OTP delivery');
        return this.client;
    }

    validatePhone(phone) {
        if (!phone || typeof phone !== 'string' || !E164.test(phone)) {
            const err = new Error('Phone must be in E.164 format (e.g. +15551234567)');
            err.status = 400;
            throw err;
        }
    }

    async requestOtp(phone) {
        this.validatePhone(phone);

        const code = generateCode();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

        this._upsertOtp.run(phone, hashCode(code), now.toISOString(), expiresAt.toISOString());

        const client = this._getClient();
        await client.messages.create({
            to: phone,
            messagingServiceSid: this.messagingServiceSid,
            body: `Your verification code is ${code}. It expires in 10 minutes.`
        });

        const isExistingUser = !!this.userService.getUserByPhone(phone);
        logOut('AuthService', `OTP sent to ${phone} (isExistingUser=${isExistingUser})`);
        return { isExistingUser };
    }

    verifyOtp(phone, code) {
        this.validatePhone(phone);
        if (!code || !/^\d{6}$/.test(code)) {
            const err = new Error('Code must be 6 digits');
            err.status = 400;
            throw err;
        }

        const row = this._getOtp.get(phone);
        if (!row) {
            const err = new Error('No verification pending for this phone');
            err.status = 401;
            throw err;
        }

        if (new Date(row.expires_at).getTime() < Date.now()) {
            this._deleteOtp.run(phone);
            const err = new Error('Code expired');
            err.status = 410;
            throw err;
        }

        if (row.attempts >= MAX_ATTEMPTS) {
            const err = new Error('Too many attempts');
            err.status = 429;
            throw err;
        }

        if (hashCode(code) !== row.code_hash) {
            this._incrementAttempts.run(phone);
            const err = new Error('Invalid code');
            err.status = 401;
            throw err;
        }

        this._markVerified.run(phone);
        const isExistingUser = !!this.userService.getUserByPhone(phone);
        logOut('AuthService', `OTP verified for ${phone} (isExistingUser=${isExistingUser})`);
        return { verified: true, isExistingUser };
    }

    async completeAuth(phone, name) {
        this.validatePhone(phone);

        const row = this._getOtp.get(phone);
        if (!row || !row.verified) {
            const err = new Error('No verified OTP for this phone');
            err.status = 401;
            throw err;
        }

        const existing = this.userService.getUserByPhone(phone);
        if (existing) {
            this._deleteOtp.run(phone);
            logOut('AuthService', `Signin complete for ${phone} → ${existing.userGUID}`);
            return { userGUID: existing.userGUID };
        }

        if (!name || typeof name !== 'string' || !name.trim()) {
            const err = new Error('Name is required for new users');
            err.status = 400;
            throw err;
        }

        // Create the user first so provisioning can patch them. If provisioning
        // fails we roll back the user and surface the Twilio error to the client.
        const userGUID = this.userService.createUser({ name: name.trim(), phone });
        try {
            await this.twilioNumberService.provisionForUser(userGUID, phone);
        } catch (err) {
            this.userService.deleteUser(userGUID);
            const wrapped = new Error(`Could not provision a Twilio number: ${err.message}`);
            wrapped.status = 502;
            if (err.twilioCode !== undefined) wrapped.twilioCode = err.twilioCode;
            if (err.twilioMessage) wrapped.twilioMessage = err.twilioMessage;
            if (err.twilioMoreInfo) wrapped.twilioMoreInfo = err.twilioMoreInfo;
            if (err.code) wrapped.reason = err.code;
            if (err.country) wrapped.country = err.country;
            throw wrapped;
        }

        this._deleteOtp.run(phone);
        logOut('AuthService', `Signup complete for ${phone} → ${userGUID}`);
        return { userGUID };
    }
}

module.exports = { AuthService };
