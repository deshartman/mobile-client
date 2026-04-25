/**
 * Device Service for managing Twilio Voice SDK
 * Handles call functionality including setup, making/receiving calls, and call controls
 * Also manages audio devices and provides volume indicators
 *
 * Loaded as a classic <script> tag, so it depends on the browser-global `Twilio`
 * exported by /libs/twilio.min.js. Exposes `window.deviceService` as a singleton.
 */

class DeviceService {
    constructor() {
        this.device = null;
        this.currentCall = null;
        this.isReady = false;
        this.listeners = {};
        this.logLevel = 1;
    }

    /**
     * Initialize the Twilio Device with a token
     * 
     * @param {string} token - The Twilio access token
     * @returns {Promise<void>} - Promise resolving when device is ready
     */
    async setup(token) {
        try {
            if (this.device) {
                await this.destroy();
            }

            if (!window.Twilio || !window.Twilio.Device) {
                throw new Error('Twilio Voice SDK not loaded — ensure /libs/twilio.min.js is included before DeviceService.js');
            }
            const Device = window.Twilio.Device;

            this.device = new Device(token, {
                codecPreferences: ['opus', 'pcmu'],
                enableRingingState: true,
                logLevel: this.logLevel
            });

            // Set up event listeners
            this.device.on('registered', this._handleRegistered.bind(this));
            this.device.on('error', this._handleError.bind(this));
            this.device.on('incoming', this._handleIncoming.bind(this));
            this.device.on('tokenWillExpire', this._handleTokenWillExpire.bind(this));
            this.device.on('tokenExpired', this._handleTokenExpired.bind(this));

            // Register the device
            await this.device.register();
            return this.device;
        } catch (error) {
            console.error('Error setting up Twilio device:', error);
            this._triggerEvent('error', error);
            throw error;
        }
    }

    /**
     * Make an outgoing call
     * 
     * @param {string} to - The recipient's phone number or client identifier
     * @param {Object} options - Additional call options
     * @returns {Promise<Object>} - Promise resolving to the call object
     */
    async makeCall(to, options = {}) {
        if (!this.device || !this.isReady) {
            throw new Error('Device not ready. Call setup() first.');
        }

        try {
            const params = {
                To: to,
                ...options
            };

            this.currentCall = await this.device.connect({ params });

            // Set up call event listeners
            this.currentCall.on('accept', () => this._triggerEvent('callAccepted', this.currentCall));
            this.currentCall.on('disconnect', () => {
                this._triggerEvent('callEnded', this.currentCall);
                this.currentCall = null;
            });
            this.currentCall.on('error', (error) => this._triggerEvent('callError', error));
            this.currentCall.on('mute', (isMuted) => this._triggerEvent('mute', isMuted));

            this._triggerEvent('callStarted', this.currentCall);
            return this.currentCall;
        } catch (error) {
            console.error('Error making call:', error);
            this._triggerEvent('error', error);
            throw error;
        }
    }

    /**
     * Answer an incoming call
     * 
     * @returns {Promise<Object>} - Promise resolving to the call object
     */
    async answerCall() {
        if (!this.currentCall) {
            throw new Error('No incoming call to answer');
        }

        try {
            await this.currentCall.accept();
            this._triggerEvent('callAccepted', this.currentCall);
            return this.currentCall;
        } catch (error) {
            console.error('Error answering call:', error);
            this._triggerEvent('error', error);
            throw error;
        }
    }

    /**
     * Reject an incoming call
     * 
     * @returns {Promise<void>} - Promise resolving when call is rejected
     */
    async rejectCall() {
        if (!this.currentCall) {
            throw new Error('No incoming call to reject');
        }

        try {
            await this.currentCall.reject();
            this._triggerEvent('callRejected', this.currentCall);
            this.currentCall = null;
        } catch (error) {
            console.error('Error rejecting call:', error);
            this._triggerEvent('error', error);
            throw error;
        }
    }

    /**
     * End the current active call
     * 
     * @returns {Promise<void>} - Promise resolving when call is ended
     */
    async endCall() {
        if (!this.currentCall) {
            return;
        }

        try {
            await this.currentCall.disconnect();
            this._triggerEvent('callEnded', this.currentCall);
            this.currentCall = null;
        } catch (error) {
            console.error('Error ending call:', error);
            this._triggerEvent('error', error);
            throw error;
        }
    }

    /**
     * Mute or unmute the current call
     * 
     * @param {boolean} isMuted - Whether to mute (true) or unmute (false)
     * @returns {void}
     */
    setMuted(isMuted) {
        if (!this.currentCall) {
            throw new Error('No active call to mute/unmute');
        }

        try {
            this.currentCall.mute(isMuted);
            this._triggerEvent('mute', isMuted);
        } catch (error) {
            console.error('Error setting mute state:', error);
            this._triggerEvent('error', error);
            throw error;
        }
    }

    /**
     * Send DTMF tones during a call
     * 
     * @param {string} digits - The DTMF digits to send (0-9, *, #)
     * @returns {void}
     */
    sendDigits(digits) {
        if (!this.currentCall) {
            throw new Error('No active call to send digits');
        }

        try {
            this.currentCall.sendDigits(digits);
        } catch (error) {
            console.error('Error sending digits:', error);
            this._triggerEvent('error', error);
            throw error;
        }
    }

    /**
     * Register event listeners for device events
     * 
     * @param {string} event - The event name to listen for
     * @param {Function} callback - The callback function
     * @returns {void}
     */
    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    /**
     * Remove event listeners
     * 
     * @param {string} event - The event name to remove listener for
     * @param {Function} callback - The specific callback to remove
     * @returns {void}
     */
    off(event, callback) {
        if (!this.listeners[event]) {
            return;
        }

        if (callback) {
            this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
        } else {
            delete this.listeners[event];
        }
    }

    /**
     * Get the current call status
     * 
     * @returns {string} - The current call status
     */
    getCallStatus() {
        if (!this.currentCall) {
            return 'idle';
        }
        return this.currentCall.status();
    }

    /**
     * Check if a call is currently active
     * 
     * @returns {boolean} - True if a call is active
     */
    isCallActive() {
        return !!this.currentCall;
    }

    /**
     * Check if the current call is muted
     * 
     * @returns {boolean} - True if the call is muted
     */
    isCallMuted() {
        if (!this.currentCall) {
            return false;
        }
        return this.currentCall.isMuted();
    }

    /**
     * Get the current device status
     * 
     * @returns {string} - The current device status
     */
    getDeviceStatus() {
        if (!this.device) {
            return 'uninitialized';
        }
        return this.device.state;
    }

    /**
     * Clean up and destroy the device instance
     * 
     * @returns {Promise<void>} - Promise resolving when device is destroyed
     */
    async destroy() {
        if (!this.device) {
            return;
        }

        try {
            if (this.currentCall) {
                await this.endCall();
            }

            this.device.removeAllListeners();
            await this.device.unregister();
            this.device = null;
            this.isReady = false;
            this._triggerEvent('destroyed');
        } catch (error) {
            console.error('Error destroying device:', error);
            this._triggerEvent('error', error);
            throw error;
        }
    }

    /**
     * Update the device with a new token when the current one is about to expire
     * 
     * @param {string} token - The new Twilio access token
     * @returns {Promise<void>} - Promise resolving when token is updated
     */
    async updateToken(token) {
        if (!this.device) {
            throw new Error('Device not initialized. Call setup() first.');
        }

        try {
            await this.device.updateToken(token);
            this._triggerEvent('tokenUpdated');
        } catch (error) {
            console.error('Error updating token:', error);
            this._triggerEvent('error', error);
            throw error;
        }
    }

    /**
     * Set the log level for the Twilio Device
     * 
     * @param {number} level - Log level (0-3)
     */
    setLogLevel(level) {
        this.logLevel = level;
        if (this.device) {
            this.device.updateOptions({ logLevel: level });
        }
    }

    /**
     * Get all available audio output devices
     * 
     * @returns {Map} - Map of available output devices
     */
    getAvailableOutputDevices() {
        if (!this.device || !this.device.audio) {
            return new Map();
        }
        return this.device.audio.availableOutputDevices;
    }

    /**
     * Check if output device selection is supported by the browser
     * 
     * @returns {boolean} - True if output selection is supported
     */
    isOutputSelectionSupported() {
        if (!this.device || !this.device.audio) {
            return false;
        }
        return this.device.audio.isOutputSelectionSupported;
    }

    /**
     * Get the currently selected speaker devices
     * 
     * @returns {Set} - Set of selected speaker devices
     */
    getSpeakerDevices() {
        if (!this.device || !this.device.audio) {
            return new Set();
        }
        return this.device.audio.speakerDevices.get();
    }

    /**
     * Set the speaker devices to use
     * 
     * @param {Array<string>} deviceIds - Array of device IDs to use
     */
    setSpeakerDevices(deviceIds) {
        if (!this.device || !this.device.audio) {
            throw new Error('Device not initialized. Call setup() first.');
        }
        this.device.audio.speakerDevices.set(deviceIds);
    }

    /**
     * Get the currently selected ringtone devices
     * 
     * @returns {Set} - Set of selected ringtone devices
     */
    getRingtoneDevices() {
        if (!this.device || !this.device.audio) {
            return new Set();
        }
        return this.device.audio.ringtoneDevices.get();
    }

    /**
     * Set the ringtone devices to use
     * 
     * @param {Array<string>} deviceIds - Array of device IDs to use
     */
    setRingtoneDevices(deviceIds) {
        if (!this.device || !this.device.audio) {
            throw new Error('Device not initialized. Call setup() first.');
        }
        this.device.audio.ringtoneDevices.set(deviceIds);
    }

    /**
     * Register a callback for volume events on the current call
     * 
     * @param {Function} callback - Function to call with volume data
     * @returns {void}
     */
    registerVolumeCallback(callback) {
        if (!this.currentCall) {
            throw new Error('No active call to monitor volume');
        }

        this.currentCall.on('volume', (inputVolume, outputVolume) => {
            callback(inputVolume, outputVolume);
        });
    }

    /**
     * Register a callback for audio device changes
     * 
     * @param {Function} callback - Function to call when audio devices change
     * @returns {void}
     */
    registerDeviceChangeCallback(callback) {
        if (!this.device || !this.device.audio) {
            throw new Error('Device not initialized. Call setup() first.');
        }

        this.device.audio.on('deviceChange', callback);
    }

    // Private methods

    /**
     * Trigger an event to all registered listeners
     * 
     * @private
     * @param {string} event - The event name
     * @param {*} data - The data to pass to listeners
     */
    _triggerEvent(event, data) {
        if (!this.listeners[event]) {
            return;
        }

        this.listeners[event].forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`Error in ${event} listener:`, error);
            }
        });
    }

    /**
     * Handle device registered event
     * 
     * @private
     */
    _handleRegistered() {
        this.isReady = true;
        this._triggerEvent('ready');
    }

    /**
     * Handle device errors
     * 
     * @private
     * @param {Error} error - The error object
     */
    _handleError(error) {
        console.error('Twilio device error:', error);
        this._triggerEvent('error', error);
    }

    /**
     * Handle incoming calls
     * 
     * @private
     * @param {Object} call - The incoming call object
     */
    _handleIncoming(call) {
        this.currentCall = call;

        // Set up call event listeners
        call.on('accept', () => this._triggerEvent('callAccepted', call));
        call.on('disconnect', () => {
            this._triggerEvent('callEnded', call);
            this.currentCall = null;
        });
        call.on('reject', () => {
            this._triggerEvent('callRejected', call);
            this.currentCall = null;
        });
        call.on('error', (error) => this._triggerEvent('callError', error));

        this._triggerEvent('incomingCall', call);
    }

    /**
     * Handle token will expire event
     * 
     * @private
     */
    _handleTokenWillExpire() {
        this._triggerEvent('tokenWillExpire');
    }

    /**
     * Handle token expired event
     * 
     * @private
     */
    _handleTokenExpired() {
        this._triggerEvent('tokenExpired');
    }
}

// Expose singleton on the global so classic <script> consumers can reach it
window.deviceService = new DeviceService();
