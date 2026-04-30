/**
 * Twilio voice service — token issuance and TwiML generation.
 *
 * Public API:
 *  - generateToken(userGuid, { twimlAppSid, region } = {})
 *      Issues an Access Token (VoiceGrant) with `userGuid` as identity.
 *  - generateIncomingTwiml(clientIdentity)
 *      <Response><Dial><Client>{clientIdentity}</Client></Dial></Response>,
 *      or <Say> fallback when identity is missing.
 *  - generateOutgoingTwiml(params)
 *      Switches on params.destinationType: phone | assistant | flex | custom.
 *      Ported from voice-sdk-call.protected.ts.
 */
const EventEmitter = require('events');
const twilio = require('twilio');
const { AccessToken } = twilio.jwt;
const { VoiceGrant } = AccessToken;
const VoiceResponse = twilio.twiml.VoiceResponse;
const { logOut, logError } = require('../utils/logger');

const RESERVED_PARAMS = new Set([
    'From', 'To', 'CallSid', 'AccountSid', 'ApiVersion',
    'Direction', 'CallerName', 'destinationType'
]);

class VoiceServices extends EventEmitter {
    constructor(userService) {
        super();
        this.userService = userService;
        this.initializeTwilioConfig();
    }

    initializeTwilioConfig() {
        this.twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
        this.twilioApiKey = process.env.TWILIO_API_KEY;
        this.twilioApiSecret = process.env.TWILIO_API_SECRET;
        this.twimlAppSid = process.env.TWIML_APP_SID;
        this.twilioRegion = process.env.TWILIO_REGION;

        const requiredVars = [
            { name: 'TWILIO_ACCOUNT_SID', value: this.twilioAccountSid },
            { name: 'TWILIO_API_KEY', value: this.twilioApiKey },
            { name: 'TWILIO_API_SECRET', value: this.twilioApiSecret },
            { name: 'TWIML_APP_SID', value: this.twimlAppSid }
        ];

        const missingVars = requiredVars.filter(v => !v.value);
        if (missingVars.length > 0) {
            const missingNames = missingVars.map(v => v.name).join(', ');
            logError('VoiceServices', `Missing required environment variables: ${missingNames}`);
            throw new Error(`Missing required Twilio environment variables: ${missingNames}`);
        }

        logOut('VoiceServices', 'Twilio configuration initialized successfully');
    }

    /**
     * Generate a Twilio access token for a user.
     *
     * @param {string} userGuid Device identity — calls to this identity ring the user's browser.
     * @param {Object} [opts]
     * @param {string} [opts.twimlAppSid] Override the env TwiML app SID for this token.
     * @param {string} [opts.region] Twilio edge region (e.g. 'au1').
     * @returns {{ token: string, identity: string }}
     */
    generateToken(userGuid, { twimlAppSid, region } = {}) {
        logOut('VoiceServices', `generateToken called for userGuid: ${userGuid}`);

        if (!userGuid) {
            throw new Error('Missing required parameter: userGuid');
        }

        const user = this.userService.getUser(userGuid);
        if (!user) {
            throw new Error('User not found');
        }

        try {
            const appSid = twimlAppSid || this.twimlAppSid;
            const voiceGrant = new VoiceGrant({
                outgoingApplicationSid: appSid,
                incomingAllow: true
            });

            const tokenOptions = { identity: userGuid, ttl: 3600 };
            const edgeRegion = region || this.twilioRegion;
            if (edgeRegion) {
                tokenOptions.region = edgeRegion;
            }

            const token = new AccessToken(
                this.twilioAccountSid,
                this.twilioApiKey,
                this.twilioApiSecret,
                tokenOptions
            );
            token.addGrant(voiceGrant);

            const tokenJwt = token.toJwt();
            logOut('VoiceServices', `Token generated for userGuid: ${userGuid} (region=${edgeRegion || 'default'})`);
            this.emit('tokenGenerated', { userGuid, success: true });
            return { token: tokenJwt, identity: userGuid };
        } catch (error) {
            logError('VoiceServices', `Token generation failed for userGuid: ${userGuid} - ${error.message}`);
            this.emit('tokenGenerationFailed', { userGuid, error: error.message });
            throw error;
        }
    }

    /**
     * TwiML for a PSTN call arriving on a user's Twilio number.
     * Routes the call to the user's browser client via `<Dial><Client>`.
     */
    generateIncomingTwiml(clientIdentity) {
        const twiml = new VoiceResponse();
        if (!clientIdentity) {
            twiml.say("We're sorry, but we're unable to connect your call at this time.");
            return twiml.toString();
        }
        const dial = twiml.dial();
        dial.client(clientIdentity);
        return twiml.toString();
    }

    /**
     * TwiML for an outbound call initiated by the browser (Device.connect()).
     * Switches on params.destinationType: phone (default) | assistant | flex | custom.
     *
     * Returns an error TwiML (<Say>) on failure rather than throwing, so
     * Twilio still completes the leg with audio feedback.
     */
    generateOutgoingTwiml(params = {}) {
        const voiceResponse = new VoiceResponse();
        try {
            const destinationType = params.destinationType || 'phone';
            logOut('VoiceServices', `Outgoing TwiML — destinationType=${destinationType}, From=${params.From}`);

            switch (destinationType) {
                case 'phone':
                    this._buildPhoneTwiml(voiceResponse, params);
                    break;
                case 'assistant':
                    this._buildAssistantTwiml(voiceResponse, params);
                    break;
                case 'flex':
                    this._buildFlexTwiml(voiceResponse, params);
                    break;
                case 'custom':
                    voiceResponse.say('This is a custom routing configuration. Please configure your destination.');
                    break;
                default:
                    throw new Error(`Unknown destination type: ${destinationType}`);
            }

            return voiceResponse.toString();
        } catch (error) {
            logError('VoiceServices', `Error building outgoing TwiML: ${error.message}`);
            const errorResponse = new VoiceResponse();
            errorResponse.say("We're sorry, but we're unable to connect your call at this time. Please try again later.");
            return errorResponse.toString();
        }
    }

    _buildPhoneTwiml(voiceResponse, params) {
        // Accept both the reference's `phoneNumber` and Twilio's default `To` field.
        let phoneNumber = params.phoneNumber || params.To;

        // URL decoding turns "+" into space — restore the leading "+".
        if (phoneNumber && phoneNumber.startsWith(' ')) {
            phoneNumber = '+' + phoneNumber.trim();
        }

        if (!phoneNumber) {
            throw new Error('Missing phoneNumber/To for phone destination');
        }

        // Caller ID must be the caller's provisioned twilio_number. No fallback.
        if (!params.userGuid) {
            throw new Error('Missing userGuid — required to resolve caller ID');
        }
        const user = this.userService.getUser(params.userGuid);
        if (!user || !user.twilioNumber) {
            throw new Error(`User ${params.userGuid} has no twilio_number provisioned — cannot place outbound call`);
        }
        const callerId = user.twilioNumber;

        // Configure status callback so /webhooks/voice/status fires and the
        // activity log picks up call completion + duration.
        const serverBaseUrl = process.env.SERVER_BASE_URL;
        const dialOpts = { callerId };
        if (serverBaseUrl) {
            const hasScheme = /^https?:\/\//.test(serverBaseUrl);
            const origin = hasScheme ? serverBaseUrl.replace(/\/$/, '') : `http://${serverBaseUrl}`;
            dialOpts.action = `${origin}/webhooks/voice/status`;
        }

        logOut('VoiceServices', `Dialing phone: ${phoneNumber} (callerId=${callerId}, statusCb=${dialOpts.action || 'none'})`);
        const dial = voiceResponse.dial(dialOpts);
        const numberOpts = {};
        if (serverBaseUrl) {
            const hasScheme = /^https?:\/\//.test(serverBaseUrl);
            const origin = hasScheme ? serverBaseUrl.replace(/\/$/, '') : `http://${serverBaseUrl}`;
            numberOpts.statusCallback = `${origin}/webhooks/voice/status`;
            numberOpts.statusCallbackEvent = 'initiated ringing answered completed';
            numberOpts.statusCallbackMethod = 'POST';
        }
        dial.number(numberOpts, phoneNumber);
    }

    _buildAssistantTwiml(voiceResponse, params) {
        const assistantSid = params.assistantSid
            || process.env.VOICE_SDK_ASSISTANT_SID
            || process.env.ASSISTANT_SID;

        if (!assistantSid) {
            throw new Error('Missing assistantSid — pass as param or set VOICE_SDK_ASSISTANT_SID');
        }

        const greeting = params.greeting
            || process.env.VOICE_SDK_GREETING
            || 'Hello! How can I help you today?';
        const voiceId = params.voiceId
            || process.env.VOICE_SDK_VOICE_ID
            || 'en-US-Journey-O';

        logOut('VoiceServices', `Connecting to Assistant: ${assistantSid} (voice=${voiceId})`);
        const connect = voiceResponse.connect();
        connect.assistant({
            id: assistantSid,
            welcomeGreeting: greeting,
            voice: voiceId
        });
    }

    _buildFlexTwiml(voiceResponse, params) {
        const workflowSid = process.env.FLEX_WORKFLOW_SID;
        const workspaceSid = process.env.FLEX_WORKSPACE_SID;
        if (!workflowSid || !workspaceSid) {
            throw new Error('Missing FLEX_WORKFLOW_SID or FLEX_WORKSPACE_SID');
        }

        const taskAttributes = {
            from: params.From,
            channel: 'voice',
            source: 'voice-sdk-web-client'
        };
        Object.keys(params).forEach(key => {
            if (!RESERVED_PARAMS.has(key) && params[key]) {
                taskAttributes[key] = params[key];
            }
        });

        logOut('VoiceServices', `Enqueuing to Flex workflow ${workflowSid}`);
        const enqueue = voiceResponse.enqueue({ workflowSid });
        enqueue.task(JSON.stringify(taskAttributes));
    }
}

module.exports = { VoiceServices };
