/**  
 * This service manages voice-related functionality including Twilio token generation and call initiation.
 * It handles all Twilio configuration internally using environment variables and provides methods for:
 * 
 * - generateToken: Creates Twilio access tokens for authenticated users
 * - initiateCall: Handles voice call initiation (placeholder implementation)
 * 
 * The service manages Twilio credentials internally and validates user authentication before processing requests.
 */
const EventEmitter = require('events');
const { AccessToken } = require('twilio').jwt;
const { VoiceGrant } = AccessToken;
const { logOut, logError } = require('../utils/logger');

class VoiceServices extends EventEmitter {
    constructor(userService) {
        super();
        this.userService = userService;
        this.initializeTwilioConfig();
    }

    /**
     * Initialize Twilio configuration from environment variables
     * Validates that all required Twilio credentials are present
     */
    initializeTwilioConfig() {
        this.twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
        this.twilioApiKey = process.env.TWILIO_API_KEY;
        this.twilioApiSecret = process.env.TWILIO_API_SECRET;
        this.twimlAppSid = process.env.TWIML_APP_SID;

        // Validate required environment variables
        const requiredVars = [
            { name: 'TWILIO_ACCOUNT_SID', value: this.twilioAccountSid },
            { name: 'TWILIO_API_KEY', value: this.twilioApiKey },
            { name: 'TWILIO_API_SECRET', value: this.twilioApiSecret },
            { name: 'TWIML_APP_SID', value: this.twimlAppSid }
        ];

        const missingVars = requiredVars.filter(variable => !variable.value);
        
        if (missingVars.length > 0) {
            const missingNames = missingVars.map(v => v.name).join(', ');
            logError('VoiceServices', `Missing required environment variables: ${missingNames}`);
            throw new Error(`Missing required Twilio environment variables: ${missingNames}`);
        }

        logOut('VoiceServices', 'Twilio configuration initialized successfully');
    }

    /**
     * Generate a Twilio access token for a user
     * 
     * @param {string} userGuid - GUID of the user requesting the token
     * @returns {Object} Object containing the JWT token
     * @throws {Error} If user is not found or token generation fails
     */
    generateToken(userGuid) {
        logOut('VoiceServices', `generateToken called for userGuid: ${userGuid}`);

        if (!userGuid) {
            throw new Error('Missing required parameter: userGuid');
        }

        // Check if user exists
        const user = this.userService.getUser(userGuid);
        if (!user) {
            throw new Error('User not found');
        }

        try {
            // Create a Voice Grant for this token
            const voiceGrant = new VoiceGrant({
                outgoingApplicationSid: this.twimlAppSid,
                incomingAllow: true, // Allow incoming calls
            });

            // Create an access token with the userGuid as the identity
            const token = new AccessToken(
                this.twilioAccountSid,
                this.twilioApiKey,
                this.twilioApiSecret,
                { identity: userGuid }
            );

            // Add the voice grant to the token
            token.addGrant(voiceGrant);

            // Return the token as JWT
            const tokenJwt = token.toJwt();
            logOut('VoiceServices', `Token generated successfully for userGuid: ${userGuid}`);
            
            this.emit('tokenGenerated', { userGuid, success: true });
            return { token: tokenJwt };
        } catch (error) {
            logError('VoiceServices', `Token generation failed for userGuid: ${userGuid} - ${error.message}`);
            this.emit('tokenGenerationFailed', { userGuid, error: error.message });
            throw error;
        }
    }

    /**
     * Initiate a voice call for a user
     * 
     * @param {string} userGuid - GUID of the user initiating the call
     * @param {string} phoneNumber - Phone number to call
     * @returns {Object} Call initiation response
     * @throws {Error} If user is not found or required parameters are missing
     */
    initiateCall(userGuid, phoneNumber) {
        logOut('VoiceServices', `initiateCall called for userGuid: ${userGuid}, phoneNumber: ${phoneNumber}`);

        if (!userGuid || !phoneNumber) {
            throw new Error('Missing required parameters: userGuid and phoneNumber');
        }

        // Check if user exists
        const user = this.userService.getUser(userGuid);
        if (!user) {
            throw new Error('User not found');
        }

        try {
            // Placeholder for voice dial logic
            logOut('VoiceServices', `Call initiation processed for userGuid: ${userGuid}, phoneNumber: ${phoneNumber}`);
            
            const response = {
                success: true,
                message: 'Voice call initiation processed',
                userGuid: userGuid,
                phoneNumber: phoneNumber
            };

            this.emit('callInitiated', { userGuid, phoneNumber, success: true });
            return response;
        } catch (error) {
            logError('VoiceServices', `Call initiation failed for userGuid: ${userGuid} - ${error.message}`);
            this.emit('callInitiationFailed', { userGuid, phoneNumber, error: error.message });
            throw error;
        }
    }
}

module.exports = { VoiceServices };