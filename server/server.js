/**
 * Main server file that sets up Express and defines API endpoints.
 * @module server
 * @requires dotenv
 * @requires express
 */

require('dotenv').config();
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
let serverBaseUrl = process.env.SERVER_BASE_URL || "localhost"; // Store server URL

app.use(express.json());    // For JSON payloads

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

// Basic health check endpoint to verify server status.
app.get('/', (req, res) => {
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
app.post('/users', (req, res) => {
    try {
        const userGuid = userService.createUser(req.body);
        res.status(201).json({ guid: userGuid });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

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
 * Attempts to start the server on the configured port (from environment or default 3000).
 * If the port is in use, incrementally tries the next port number.
 * 
 * @function startServer
 * @returns {http.Server} Express server instance
 * @throws {Error} If server fails to start for reasons other than port in use
 */
let currentPort = PORT;

const startServer = () => {
    try {
        const server = app.listen(currentPort, async () => {
            try {
                logOut('Server', `Server is running on port ${currentPort}`);
            } catch (error) {
                logError('Server', `Failed to load initial context and manifest: ${error}`);
                process.exit(1);
            }
        });
    } catch (error) {
        if (error.code === 'EADDRINUSE') {
            logOut('Server', `Port ${currentPort} is in use, trying ${currentPort + 1}`);
            currentPort++;
            startServer();
        } else {
            logError('Server', `Failed to start server: ${error}`);
            process.exit(1);
        }
    }
};

startServer();
