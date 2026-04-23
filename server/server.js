/**
 * Main server file that sets up Express and defines API endpoints.
 * @module server
 * @requires dotenv
 * @requires express
 */

require('dotenv').config();
const express = require('express');
const path = require('path');

// Environment variables
const SERVER_BASE_URL = process.env.SERVER_BASE_URL || "localhost";
const PORT = process.env.PORT || 3000;

const app = express();

app.use(express.json());    // For JSON payloads
app.use(express.static(path.join(__dirname, '../client'))); // Serve static files from client directory

const { logOut, logError } = require('./utils/logger');


// Import Services
const { ContactService } = require('./services/ContactServices');
const { UserService } = require('./services/UserServices');
const { VoiceServices } = require('./services/VoiceServices');
const { WebhookService } = require('./services/WebhookService');
const { SseService } = require('./services/SseService');

// Initialize services
const contactService = new ContactService();
const userService = new UserService();
const voiceServices = new VoiceServices(userService);
const webhookService = new WebhookService(contactService);
const sseService = new SseService(contactService);


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
        const contactsArray = Array.from(contacts.values());
        logOut('API', `GET /contacts/${userGuid} - Returning ${contactsArray.length} contacts`);
        res.json(contactsArray);
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

// User Endpoints
app.post('/users', (req, res) => {
    logOut('API', `POST /users - Request received with body: ${JSON.stringify(req.body)}`);
    
    try {
        const { email } = req.body;
        
        // Check if user with this email already exists
        const existingUser = userService.getUserByEmail(email);
        
        if (existingUser) {
            // Return existing user GUID
            logOut('API', `POST /users - Returning existing user GUID: ${existingUser.userGUID} for email: ${email}`);
            res.status(200).json({ userGUID: existingUser.userGUID });
        } else {
            // Create new user
            const userGUID = userService.createUser(req.body);
            logOut('API', `POST /users - User created with GUID: ${userGUID}`);
            res.status(201).json({ userGUID });
        }
    } catch (error) {
        logError('API', `POST /users - Error: ${error.message}`);
        res.status(500).json({ error: error.message });
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

app.delete('/users/:userGuid', (req, res) => {
    const userGuid = req.params.userGuid;
    logOut('API', `DELETE /users/${userGuid} - Request received`);
    
    try {
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

// Stubbed call/message endpoints - simulate Twilio webhooks firing back
app.post('/voice/call/start', (req, res) => {
    const { userGuid, to, contactGuid } = req.body;
    logOut('API', `POST /voice/call/start - userGuid: ${userGuid}, to: ${to}`);

    if (!userGuid || !to) {
        return res.status(400).json({ error: 'Missing required fields: userGuid, to' });
    }

    // TODO: replace with real Twilio call creation (client.calls.create({...}))
    const callSid = webhookService.registerCall({ userGuid, to, contactGuid });
    res.json({ callSid });
});

app.post('/voice/call/end', (req, res) => {
    const { callSid } = req.body;
    logOut('API', `POST /voice/call/end - callSid: ${callSid}`);

    if (!callSid) {
        return res.status(400).json({ error: 'Missing required field: callSid' });
    }

    // TODO: replace with real call termination (client.calls(callSid).update({status:'completed'}))
    // With real Twilio this would NOT directly fire the activity — Twilio's status
    // webhook would. For the stub we simulate that callback.
    webhookService.simulateVoiceCompletion(callSid, 200);
    res.status(202).json({ status: 'ending' });
});

app.post('/messaging/send', (req, res) => {
    const { userGuid, to, body, channel, contactGuid } = req.body;
    logOut('API', `POST /messaging/send - userGuid: ${userGuid}, to: ${to}, channel: ${channel}`);

    if (!userGuid || !to || !channel) {
        return res.status(400).json({ error: 'Missing required fields: userGuid, to, channel' });
    }

    // TODO: replace with real Twilio SMS/WhatsApp send (client.messages.create({...}))
    const messageSid = webhookService.registerMessage({ userGuid, to, channel, contactGuid });
    webhookService.simulateMessageDelivered(messageSid, 200);
    res.json({ messageSid, body });
});

// Twilio webhook endpoints (URL-encoded body)
// NOTE: signature validation deferred - add twilio.validateRequest() with TWILIO_AUTH_TOKEN before going live.
app.post('/webhooks/voice/status', express.urlencoded({ extended: false }), (req, res) => {
    logOut('API', `POST /webhooks/voice/status - ${JSON.stringify(req.body)}`);
    webhookService.handleVoiceStatus(req.body);
    res.status(204).send();
});

app.post('/webhooks/messaging/status', express.urlencoded({ extended: false }), (req, res) => {
    logOut('API', `POST /webhooks/messaging/status - ${JSON.stringify(req.body)}`);
    webhookService.handleMessageStatus(req.body);
    res.status(204).send();
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

app.post('/voice/dial', (req, res) => {
    const { userGuid, phoneNumber } = req.body;
    logOut('API', `POST /voice/dial - Request received for userGuid: ${userGuid}, phoneNumber: ${phoneNumber}`);
    
    try {
        const callResponse = voiceServices.initiateCall(userGuid, phoneNumber);
        logOut('API', `POST /voice/dial - Call initiated successfully for userGuid: ${userGuid}, phoneNumber: ${phoneNumber}`);
        res.json(callResponse);
    } catch (error) {
        logError('API', `POST /voice/dial - Error: ${error.message}`);
        
        if (error.message === 'Missing required parameters: userGuid and phoneNumber') {
            return res.status(400).json({ error: error.message });
        }
        if (error.message === 'User not found') {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
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
