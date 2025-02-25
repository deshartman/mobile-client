/**
 * Main server file that sets up Express and defines API endpoints.
 * @module server
 * @requires dotenv
 * @requires express
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();
let serverBaseUrl = process.env.SERVER_BASE_URL || "localhost"; // Store server URL

app.use(express.json());    // For JSON payloads
app.use(express.static(path.join(__dirname, '../client'))); // Serve static files from client directory

const { logOut, logError } = require('./utils/logger');

// Import Services
const { ContactService } = require('./services/ContactServices');
const { UserService } = require('./services/UserServices');

// Initialize services
const contactService = new ContactService();
const userService = new UserService();


/****************************************************
 * 
 * Web Server Endpoints
 * 
 ****************************************************/

// Health check endpoint moved to /health to not conflict with static file serving
app.get('/health', (req, res) => {
    res.send(`Server Running on ${serverBaseUrl}:${PORT}`);
});

// Contact Endpoints
app.get('/contacts/:userGuid', (req, res) => {
    try {
        const contacts = contactService.getContacts(req.params.userGuid);
        res.json(Array.from(contacts.values()));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Activities Endpoints
app.get('/activities/:userGuid', (req, res) => {
    try {
        const activities = contactService.getActivities(req.params.userGuid);
        res.json(activities);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/activities/:userGuid', (req, res) => {
    try {
        const activity = contactService.addActivity(req.params.userGuid, req.body);
        res.status(201).json(activity);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/contacts/:userGuid/:contactGuid', (req, res) => {
    try {
        const contact = contactService.getContact(req.params.userGuid, req.params.contactGuid);
        if (!contact) {
            return res.status(404).json({ error: 'Contact not found' });
        }
        res.json(contact);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/contacts/:userGuid', (req, res) => {
    try {
        const contact = contactService.createContact(req.params.userGuid, req.body);
        res.status(201).json(contact);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/contacts/:userGuid/:contactGuid', (req, res) => {
    try {
        const contact = contactService.updateContact(req.params.userGuid, req.params.contactGuid, req.body);
        res.json(contact);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/contacts/:userGuid/:contactGuid', (req, res) => {
    try {
        const deleted = contactService.deleteContact(req.params.userGuid, req.params.contactGuid);
        if (!deleted) {
            return res.status(404).json({ error: 'Contact not found' });
        }
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// User Endpoints
app.get('/users/:userGuid', (req, res) => {
    try {
        const user = userService.getUser(req.params.userGuid);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/users/:userGuid', (req, res) => {
    try {
        const user = userService.updateUser(req.params.userGuid, req.body);
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/users/:userGuid', (req, res) => {
    try {
        userService.deleteUser(req.params.userGuid);
        res.status(204).send();
    } catch (error) {
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
let PORT = process.env.PORT || 3000;

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
