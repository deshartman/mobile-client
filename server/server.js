/**
 * Main server file that sets up Express and defines API endpoints.
 * @module server
 * @requires dotenv
 * @requires express
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const QRCode = require('qrcode');

// Environment variables
const SERVER_BASE_URL = process.env.SERVER_BASE_URL || "localhost";
const PORT = process.env.PORT || 3000;

const app = express();

app.use(express.json());    // For JSON payloads
app.use(express.static(path.join(__dirname, '../client'))); // Serve static files from client directory

const { logOut, logError } = require('./utils/logger');

// Initialize DB and run idempotent seed before services load
require('./db/database');
const { seed } = require('./db/seed');
seed();

// Import Services
const { ContactService } = require('./services/ContactServices');
const { UserService } = require('./services/UserServices');
const { VoiceServices } = require('./services/VoiceServices');
const { WebhookService } = require('./services/WebhookService');
const { SseService } = require('./services/SseService');
const { MessagesRepository } = require('./services/MessagesRepository');
const { ConversationsService } = require('./services/ConversationsService');
const { AuthService } = require('./services/AuthService');
const { TwilioNumberService } = require('./services/TwilioNumberService');

// Initialize services
const contactService = new ContactService();
const userService = new UserService();
const twilioNumberService = new TwilioNumberService({ userService });
const authService = new AuthService({ userService, twilioNumberService });
const voiceServices = new VoiceServices(userService);
const sseService = new SseService(contactService);
const messagesRepo = new MessagesRepository();
const conversationsService = new ConversationsService({ contactService, userService, messagesRepo, sseService });
const webhookService = new WebhookService({
    contactService,
    userService,
    sseService,
    messagesRepo,
    conversationsService
});


/****************************************************
 * 
 * Web Server Endpoints
 * 
 ****************************************************/

// Health check endpoint moved to /health to not conflict with static file serving
app.get('/health', (req, res) => {
    res.send(`Server Running on ${SERVER_BASE_URL}:${PORT}`);
});

// Contact Endpoints
app.get('/contacts/:userGuid', (req, res) => {
    const userGuid = req.params.userGuid;
    logOut('API', `GET /contacts/${userGuid} - Request received`);
    
    try {
        const contacts = contactService.getContacts(userGuid);
        logOut('API', `GET /contacts/${userGuid} - Returning ${contacts.length} contacts`);
        res.json(contacts);
    } catch (error) {
        logError('API', `GET /contacts/${userGuid} - Error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// Activities Endpoints
app.get('/activities/:userGuid', (req, res) => {
    const userGuid = req.params.userGuid;
    logOut('API', `GET /activities/${userGuid} - Request received`);
    
    try {
        const activities = contactService.getActivities(userGuid);
        logOut('API', `GET /activities/${userGuid} - Returning ${activities ? activities.length : 0} activities`);
        logOut('API', `GET /activities/${userGuid} - Response data: ${JSON.stringify(activities)}`);
        res.json(activities);
    } catch (error) {
        logError('API', `GET /activities/${userGuid} - Error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

app.get('/activities/:userGuid/by-contact/:contactGuid', (req, res) => {
    const { userGuid, contactGuid } = req.params;
    logOut('API', `GET /activities/${userGuid}/by-contact/${contactGuid} - Request received`);

    try {
        const activities = contactService.getActivities(userGuid, { contactGuid });
        logOut('API', `GET /activities/${userGuid}/by-contact/${contactGuid} - Returning ${activities ? activities.length : 0} activities`);
        res.json(activities);
    } catch (error) {
        logError('API', `GET /activities/${userGuid}/by-contact/${contactGuid} - Error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// Unknown-number group: list activities that have no linked contact and match
// the given identity value (phone / address). Used by the Activity view when a
// user taps the drawer on a row whose inbound number isn't yet in contacts.
app.get('/activities/:userGuid/by-identity/:identityValue', (req, res) => {
    const { userGuid, identityValue } = req.params;
    logOut('API', `GET /activities/${userGuid}/by-identity/${identityValue} - Request received`);

    try {
        const activities = contactService.getActivities(userGuid, { identityValue });
        logOut('API', `GET /activities/${userGuid}/by-identity/${identityValue} - Returning ${activities ? activities.length : 0} activities`);
        res.json(activities);
    } catch (error) {
        logError('API', `GET /activities/${userGuid}/by-identity/${identityValue} - Error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

app.post('/activities/:userGuid', (req, res) => {
    const userGuid = req.params.userGuid;
    logOut('API', `POST /activities/${userGuid} - Request received with body: ${JSON.stringify(req.body)}`);
    
    try {
        const activity = contactService.addActivity(userGuid, req.body);
        logOut('API', `POST /activities/${userGuid} - Activity created: ${JSON.stringify(activity)}`);
        res.status(201).json(activity);
    } catch (error) {
        logError('API', `POST /activities/${userGuid} - Error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

app.get('/contacts/:userGuid/:contactGuid', (req, res) => {
    const { userGuid, contactGuid } = req.params;
    logOut('API', `GET /contacts/${userGuid}/${contactGuid} - Request received`);
    
    try {
        const contact = contactService.getContact(userGuid, contactGuid);
        if (!contact) {
            logOut('API', `GET /contacts/${userGuid}/${contactGuid} - Contact not found`);
            return res.status(404).json({ error: 'Contact not found' });
        }
        logOut('API', `GET /contacts/${userGuid}/${contactGuid} - Returning contact: ${JSON.stringify(contact)}`);
        res.json(contact);
    } catch (error) {
        logError('API', `GET /contacts/${userGuid}/${contactGuid} - Error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

app.post('/contacts/:userGuid', (req, res) => {
    const userGuid = req.params.userGuid;
    logOut('API', `POST /contacts/${userGuid} - Request received with body: ${JSON.stringify(req.body)}`);
    
    try {
        const contact = contactService.createContact(userGuid, req.body);
        logOut('API', `POST /contacts/${userGuid} - Contact created: ${JSON.stringify(contact)}`);
        res.status(201).json(contact);
    } catch (error) {
        logError('API', `POST /contacts/${userGuid} - Error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

app.put('/contacts/:userGuid/:contactGuid', (req, res) => {
    const { userGuid, contactGuid } = req.params;
    logOut('API', `PUT /contacts/${userGuid}/${contactGuid} - Request received with body: ${JSON.stringify(req.body)}`);
    
    try {
        const contact = contactService.updateContact(userGuid, contactGuid, req.body);
        logOut('API', `PUT /contacts/${userGuid}/${contactGuid} - Contact updated: ${JSON.stringify(contact)}`);
        res.json(contact);
    } catch (error) {
        logError('API', `PUT /contacts/${userGuid}/${contactGuid} - Error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/contacts/:userGuid/:contactGuid', (req, res) => {
    const { userGuid, contactGuid } = req.params;
    logOut('API', `DELETE /contacts/${userGuid}/${contactGuid} - Request received`);
    
    try {
        const deleted = contactService.deleteContact(userGuid, contactGuid);
        if (!deleted) {
            logOut('API', `DELETE /contacts/${userGuid}/${contactGuid} - Contact not found`);
            return res.status(404).json({ error: 'Contact not found' });
        }
        logOut('API', `DELETE /contacts/${userGuid}/${contactGuid} - Contact deleted successfully`);
        res.status(204).send();
    } catch (error) {
        logError('API', `DELETE /contacts/${userGuid}/${contactGuid} - Error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// Auth Endpoints (phone-OTP signup + signin)
// The /signup path is the QR destination. Serve the SPA shell; index.js reads
// window.location.pathname and loads the signup fragment from /view/signup/signup.html.
app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});

app.get('/auth/qr', async (req, res) => {
    try {
        // If SERVER_BASE_URL already has a scheme (e.g. https://…ngrok.dev), use it as-is;
        // otherwise treat it as a bare host and append :PORT.
        const hasScheme = /^https?:\/\//.test(SERVER_BASE_URL);
        const origin = hasScheme ? SERVER_BASE_URL : `http://${SERVER_BASE_URL}:${PORT}`;
        const signupUrl = `${origin.replace(/\/$/, '')}/signup`;
        const buffer = await QRCode.toBuffer(signupUrl, { type: 'png', width: 512 });
        res.type('png').send(buffer);
    } catch (error) {
        logError('API', `GET /auth/qr - Error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

app.post('/auth/send-otp', async (req, res) => {
    const { phone } = req.body || {};
    logOut('API', `POST /auth/send-otp - phone=${phone}`);
    try {
        const result = await authService.requestOtp(phone);
        res.json(result);
    } catch (error) {
        logError('API', `POST /auth/send-otp - Error: ${error.message}`);
        res.status(error.status || 500).json({ error: error.message });
    }
});

app.post('/auth/verify-otp', (req, res) => {
    const { phone, code } = req.body || {};
    logOut('API', `POST /auth/verify-otp - phone=${phone}`);
    try {
        const result = authService.verifyOtp(phone, code);
        res.json(result);
    } catch (error) {
        logError('API', `POST /auth/verify-otp - Error: ${error.message}`);
        res.status(error.status || 500).json({ error: error.message });
    }
});

app.post('/auth/complete', async (req, res) => {
    const { phone, name } = req.body || {};
    logOut('API', `POST /auth/complete - phone=${phone}`);
    try {
        const result = await authService.completeAuth(phone, name);
        res.json(result);
    } catch (error) {
        logError('API', `POST /auth/complete - Error: ${error.message}`);
        const body = { error: error.message };
        if (error.reason) body.reason = error.reason;
        if (error.twilioCode !== undefined) body.twilioCode = error.twilioCode;
        if (error.twilioMessage) body.twilioMessage = error.twilioMessage;
        if (error.twilioMoreInfo) body.twilioMoreInfo = error.twilioMoreInfo;
        if (error.country) body.country = error.country;
        res.status(error.status || 500).json(body);
    }
});

app.get('/users/:userGuid', (req, res) => {
    const userGuid = req.params.userGuid;
    logOut('API', `GET /users/${userGuid} - Request received`);
    
    try {
        const user = userService.getUser(userGuid);
        if (!user) {
            logOut('API', `GET /users/${userGuid} - User not found`);
            return res.status(404).json({ error: 'User not found' });
        }
        logOut('API', `GET /users/${userGuid} - Returning user: ${JSON.stringify(user)}`);
        res.json(user);
    } catch (error) {
        logError('API', `GET /users/${userGuid} - Error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

app.put('/users/:userGuid', (req, res) => {
    const userGuid = req.params.userGuid;
    logOut('API', `PUT /users/${userGuid} - Request received with body: ${JSON.stringify(req.body)}`);
    
    try {
        const user = userService.updateUser(userGuid, req.body);
        logOut('API', `PUT /users/${userGuid} - User updated: ${JSON.stringify(user)}`);
        res.json(user);
    } catch (error) {
        logError('API', `PUT /users/${userGuid} - Error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/users/:userGuid', async (req, res) => {
    const userGuid = req.params.userGuid;
    logOut('API', `DELETE /users/${userGuid} - Request received`);

    try {
        // Release the Twilio number first so we don't leak a paid resource.
        // If release fails we continue with the user delete and log the leak — the
        // alternative (refusing to delete the user) strands them in a broken state.
        try {
            await twilioNumberService.releaseForUser(userGuid);
        } catch (releaseErr) {
            logError('API', `DELETE /users/${userGuid} - Number release failed (continuing with user delete): ${releaseErr.message}`);
        }
        userService.deleteUser(userGuid);
        logOut('API', `DELETE /users/${userGuid} - User deleted successfully`);
        res.status(204).send();
    } catch (error) {
        logError('API', `DELETE /users/${userGuid} - Error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});


// SSE: per-user server-push channel
app.get('/events/:userGuid', (req, res) => {
    const { userGuid } = req.params;
    logOut('API', `GET /events/${userGuid} - SSE client connecting`);

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
    });
    res.write('event: connected\ndata: {}\n\n');

    sseService.addClient(userGuid, res);

    const keepAlive = setInterval(() => {
        res.write(': keep-alive\n\n');
    }, 30000);

    req.on('close', () => {
        clearInterval(keepAlive);
        sseService.removeClient(userGuid, res);
    });
});

// Send an outbound SMS via Twilio Conversations. The message is NOT inserted
// into the local messages table here — the onMessageAdded webhook is the
// canonical write path for both inbound and outbound messages.
app.post('/messaging/send', async (req, res) => {
    const { userGuid, to, body, contactGuid } = req.body;
    logOut('API', `POST /messaging/send - userGuid: ${userGuid}, to: ${to}`);

    if (!userGuid || !to || !body) {
        return res.status(400).json({ error: 'Missing required fields: userGuid, to, body' });
    }

    try {
        const result = await conversationsService.sendMessage({ userGuid, remoteAddress: to, body, contactGuid });
        logOut('API', `POST /messaging/send - sent ${result.messageSid} on ${result.conversationSid}`);
        res.json(result);
    } catch (err) {
        logError('API', `POST /messaging/send - ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// Thread hydration — returns { conversationSid, messages } for the given pair.
app.get('/messaging/thread/:userGuid', (req, res) => {
    const { userGuid } = req.params;
    const { to } = req.query;
    try {
        const thread = conversationsService.getThread(userGuid, to);
        res.json(thread);
    } catch (err) {
        logError('API', `GET /messaging/thread/${userGuid} - ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// Twilio webhook signature validation. Gated on TWILIO_AUTH_TOKEN — when unset
// (e.g. local dev without ngrok stability), the middleware is a no-op so
// curl-testing still works.
const twilioLib = require('twilio');
const validateTwilioRequest = (req, res, next) => {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!authToken) return next();

    const signature = req.header('X-Twilio-Signature');
    const url = `${SERVER_BASE_URL}${req.originalUrl}`;
    if (twilioLib.validateRequest(authToken, signature, url, req.body)) {
        return next();
    }
    logError('API', `Twilio signature validation failed for ${req.method} ${req.originalUrl}`);
    return res.status(403).type('text/xml').send('<Response><Say>Unauthorized</Say></Response>');
};

// Twilio webhook endpoints (URL-encoded body)
app.post('/webhooks/voice/status', express.urlencoded({ extended: false }), validateTwilioRequest, (req, res) => {
    logOut('API', `POST /webhooks/voice/status - ${JSON.stringify(req.body)}`);
    webhookService.handleVoiceStatus(req.body);
    res.status(204).send();
});

// Twilio Conversations post-event webhook (default chat service).
// Configured in Console → Conversations → Defaults → Post-event URL.
app.post('/webhooks/conversations', express.urlencoded({ extended: false }), validateTwilioRequest, (req, res) => {
    logOut('API', `POST /webhooks/conversations - ${req.body.EventType} conv=${req.body.ConversationSid || ''} msg=${req.body.MessageSid || ''} author=${req.body.Author || ''}`);
    webhookService.handleConversationsWebhook(req.body);
    res.status(204).send();
});

// Messaging Service "Send a webhook" bridge for inbound SMS.
// Console → Messaging → Services → Integration → Incoming Messages: "Send a webhook",
// URL = {SERVER_BASE_URL}/webhooks/messaging/inbound. We post the inbound into
// the matching Conversation so onMessageAdded becomes the single source of truth.
// Respond with an empty <Response/> so Twilio doesn't send an auto-reply.
app.post('/webhooks/messaging/inbound', express.urlencoded({ extended: false }), validateTwilioRequest, async (req, res) => {
    const { From, To, Body, MessageSid } = req.body;
    logOut('API', `POST /webhooks/messaging/inbound - ${MessageSid} ${From} → ${To}`);

    try {
        await conversationsService.bridgeInboundSms({
            from: From,
            to: To,
            body: Body,
            smsMessageSid: MessageSid
        });
    } catch (err) {
        logError('API', `POST /webhooks/messaging/inbound - ${err.message}`);
    }
    res.type('text/xml').send('<Response/>');
});

// Voice API Endpoints
app.post('/voice/token', (req, res) => {
    const userGuid = req.body.userGuid;
    logOut('API', `POST /voice/token - Request received for userGuid: ${userGuid}`);
    
    try {
        const tokenResponse = voiceServices.generateToken(userGuid);
        logOut('API', `POST /voice/token - Token generated successfully for userGuid: ${userGuid}`);
        res.json(tokenResponse);
    } catch (error) {
        logError('API', `POST /voice/token - Error: ${error.message}`);
        
        if (error.message === 'Missing required parameter: userGuid') {
            return res.status(400).json({ error: error.message });
        }
        if (error.message === 'User not found') {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
});

// TwiML App Voice URL — Twilio POSTs here when Device.connect() fires on the client.
// The browser passes custom keys (userGuid, contactGuid, destinationType, …) via
// Device.connect({ params }); they arrive alongside Twilio's standard fields (To, From, CallSid).
// VoiceServices.generateOutgoingTwiml switches on destinationType: phone | assistant | flex | custom.
app.post('/voice/outgoing', express.urlencoded({ extended: false }), validateTwilioRequest, (req, res) => {
    const { To, userGuid, contactGuid, CallSid, destinationType } = req.body;
    logOut('API', `POST /voice/outgoing - CallSid: ${CallSid}, To: ${To}, userGuid: ${userGuid}, destinationType: ${destinationType || 'phone'}`);

    // Only register phone-destined calls for activity logging; other branches aren't PSTN legs.
    const effectiveType = destinationType || 'phone';
    if (effectiveType === 'phone' && CallSid && userGuid) {
        webhookService.registerCallBySid(CallSid, { userGuid, to: To, contactGuid });
    }

    const twiml = voiceServices.generateOutgoingTwiml(req.body);
    res.type('text/xml').send(twiml);
});

// Inbound PSTN → browser. Twilio POSTs here when a call arrives on any provisioned
// number configured with voiceUrl={SERVER_BASE_URL}/voice/incoming. We look up the
// owner of the dialed number, then return TwiML that dials <Client>{userGuid}</Client>.
app.post('/voice/incoming', express.urlencoded({ extended: false }), validateTwilioRequest, (req, res) => {
    const { To, From, CallSid } = req.body;
    logOut('API', `POST /voice/incoming - CallSid: ${CallSid}, From: ${From}, To: ${To}`);

    const owner = userService.getUserByTwilioNumber(To);
    if (!owner) {
        logError('API', `POST /voice/incoming - No user owns number ${To}`);
        return res.type('text/xml').send(voiceServices.generateIncomingTwiml(null));
    }

    if (CallSid) {
        webhookService.registerIncomingCall({
            callSid: CallSid,
            from: From,
            to: To,
            userGuid: owner.userGUID
        });
    }

    res.type('text/xml').send(voiceServices.generateIncomingTwiml(owner.userGUID));
});



/****************************************************
 * 
 * NodeJS Server
 * 
 ****************************************************/

/**
 * Server initialization and port management.
 * Attempts to start the server on the specified port.
 * If the port is in use, incrementally tries the next port number.
 * 
 * @function startServer
 * @param {number} port - The port to attempt to start the server on
 * @returns {http.Server} Express server instance
 * @throws {Error} If server fails to start for reasons other than port in use
 */

const startServer = (port) => {
    // logOut('Server', `Starting server on port ${port}`);
    const server = app.listen(port);

    server.on('error', (error) => {     // Server emits events for errors
        if (error.code === 'EADDRINUSE') {
            server.close();
            logOut('Server', `Port ${port} is in use, trying ${port++}`);
            startServer(port++);
        } else {
            logError('Server', `Failed to start server: ${error}`);
            throw error;
        }
    });

    server.on('listening', () => {
        logOut('Server', `Server started on port ${port}`);
    });
};


startServer(PORT);
