/**
 * Provisions and releases Twilio phone numbers for users.
 *
 * Per-country configuration comes from env:
 *   TWILIO_COUNTRY_CONFIG_<ISO>_TYPE         = local | mobile | tollFree
 *   TWILIO_COUNTRY_CONFIG_<ISO>_BUNDLE_SID   (optional, required for regulated countries)
 *   TWILIO_COUNTRY_CONFIG_<ISO>_ADDRESS_SID  (optional, required for regulated countries)
 *
 * - provisionForUser(userGuid, signupPhone) — searches the country's inventory
 *   for an SMS+Voice number, purchases it with bundle/address if configured,
 *   wires per-number smsUrl/voiceUrl webhooks, persists on the user.
 * - releaseForUser(userGuid) — deletes the IncomingPhoneNumber.
 *
 * Errors expose `.twilioCode` / `.twilioMessage` when the source was a Twilio
 * REST error, so the signup endpoint can surface them to the client.
 */
const twilio = require('twilio');
const { logOut } = require('../utils/logger');

// Minimal E.164 dial-code → ISO-2. Longer prefixes first so `+1` doesn't eat `+44`.
const DIAL_CODE_TO_COUNTRY = [
    ['+61', 'AU'],
    ['+1', 'US']
];

function countryFromE164(phone) {
    if (!phone || typeof phone !== 'string') {
        const err = new Error('Invalid phone');
        err.code = 'INVALID_PHONE';
        throw err;
    }
    for (const [prefix, country] of DIAL_CODE_TO_COUNTRY) {
        if (phone.startsWith(prefix)) return country;
    }
    const err = new Error(`Unsupported country for phone ${phone}`);
    err.code = 'UNSUPPORTED_COUNTRY';
    throw err;
}

function readCountryConfig(iso) {
    const type = process.env[`TWILIO_COUNTRY_CONFIG_${iso}_TYPE`];
    if (!type) return null;
    return {
        type,
        bundleSid: process.env[`TWILIO_COUNTRY_CONFIG_${iso}_BUNDLE_SID`] || null,
        addressSid: process.env[`TWILIO_COUNTRY_CONFIG_${iso}_ADDRESS_SID`] || null
    };
}

function wrapTwilioError(err, stage) {
    const wrapped = new Error(`[${stage}] ${err.message}`);
    wrapped.stage = stage;
    if (typeof err.code === 'number') {
        wrapped.twilioCode = err.code;
        wrapped.twilioMessage = err.message;
        wrapped.twilioMoreInfo = err.moreInfo;
    }
    return wrapped;
}

class TwilioNumberService {
    constructor({ userService }) {
        this.userService = userService;
        this.client = null;
    }

    _getClient() {
        if (this.client) return this.client;

        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const serverBaseUrl = process.env.SERVER_BASE_URL;

        const missing = [];
        if (!accountSid) missing.push('TWILIO_ACCOUNT_SID');
        if (!authToken) missing.push('TWILIO_AUTH_TOKEN');
        if (!serverBaseUrl) missing.push('SERVER_BASE_URL');

        if (missing.length > 0) {
            const err = new Error(`Missing required env: ${missing.join(', ')}`);
            err.code = 'MISSING_ENV';
            throw err;
        }

        const hasScheme = /^https?:\/\//.test(serverBaseUrl);
        const origin = hasScheme ? serverBaseUrl.replace(/\/$/, '') : `http://${serverBaseUrl}`;

        this.smsUrl = `${origin}/webhooks/messaging/inbound`;
        this.voiceUrl = `${origin}/voice/incoming`;
        this.statusCallbackUrl = `${origin}/webhooks/voice/status`;
        this.client = twilio(accountSid, authToken);
        logOut('TwilioNumberService', `Initialised (sms=${this.smsUrl}, voice=${this.voiceUrl})`);
        return this.client;
    }

    async provisionForUser(userGuid, signupPhone) {
        const client = this._getClient();
        const country = countryFromE164(signupPhone);
        const config = readCountryConfig(country);

        if (!config) {
            const err = new Error(`No provisioning config for country ${country}. Set TWILIO_COUNTRY_CONFIG_${country}_TYPE in .env`);
            err.code = 'COUNTRY_NOT_CONFIGURED';
            err.country = country;
            throw err;
        }

        logOut('TwilioNumberService', `Provisioning ${country} ${config.type} number for user ${userGuid} (signup=${signupPhone})`);

        // 1. Search available inventory of the configured type.
        let inventory;
        try {
            inventory = client.availablePhoneNumbers(country)[config.type];
            if (!inventory) {
                const err = new Error(`Twilio SDK has no availablePhoneNumbers(${country}).${config.type}`);
                err.code = 'INVALID_NUMBER_TYPE';
                err.country = country;
                throw err;
            }
        } catch (err) {
            if (err.code === 'INVALID_NUMBER_TYPE') throw err;
            throw wrapTwilioError(err, 'search-init');
        }

        let available;
        try {
            available = await inventory.list({
                smsEnabled: true,
                voiceEnabled: true,
                limit: 1
            });
        } catch (err) {
            throw wrapTwilioError(err, 'search');
        }

        if (!available || available.length === 0) {
            const err = new Error(`No SMS+Voice ${config.type} numbers available in ${country}`);
            err.code = 'NO_NUMBERS_AVAILABLE';
            err.country = country;
            throw err;
        }

        const chosen = available[0].phoneNumber;

        // 2. Purchase, passing bundle/address when configured.
        const purchaseArgs = {
            phoneNumber: chosen,
            smsUrl: this.smsUrl,
            voiceUrl: this.voiceUrl,
            statusCallback: this.statusCallbackUrl
        };
        if (config.bundleSid) purchaseArgs.bundleSid = config.bundleSid;
        if (config.addressSid) purchaseArgs.addressSid = config.addressSid;

        let purchased;
        try {
            purchased = await client.incomingPhoneNumbers.create(purchaseArgs);
        } catch (err) {
            throw wrapTwilioError(err, 'purchase');
        }

        logOut('TwilioNumberService', `Purchased ${purchased.phoneNumber} (sid=${purchased.sid}) for ${userGuid}`);

        // 3. Persist. Inbound SMS routes via the per-number smsUrl set at purchase.
        this.userService.updateUser(userGuid, {
            twilioNumber: purchased.phoneNumber,
            twilioNumberSid: purchased.sid
        });

        logOut('TwilioNumberService', `User ${userGuid} provisioned with ${purchased.phoneNumber}`);
        return { phoneNumber: purchased.phoneNumber, sid: purchased.sid, country };
    }

    async releaseForUser(userGuid) {
        const user = this.userService.getUser(userGuid);
        if (!user || !user.twilioNumberSid) {
            logOut('TwilioNumberService', `Release skipped for ${userGuid} (no number)`);
            return;
        }
        const sid = user.twilioNumberSid;
        const client = this._getClient();

        try {
            await client.incomingPhoneNumbers(sid).remove();
            logOut('TwilioNumberService', `Released ${user.twilioNumber} (sid=${sid}) from user ${userGuid}`);
        } catch (err) {
            throw wrapTwilioError(err, 'release');
        }

        this.userService.updateUser(userGuid, {
            twilioNumber: null,
            twilioNumberSid: null
        });
    }
}

module.exports = { TwilioNumberService, countryFromE164 };
