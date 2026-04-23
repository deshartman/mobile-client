const { logOut } = require('../utils/logger');

class SseService {
    constructor(contactService) {
        this.contactService = contactService;
        this.clients = new Map();

        this.contactService.on('activityAdded', ({ userGuid, activity }) => {
            this.broadcast(userGuid, 'activity.added', activity);
        });
    }

    addClient(userGuid, res) {
        if (!this.clients.has(userGuid)) {
            this.clients.set(userGuid, new Set());
        }
        this.clients.get(userGuid).add(res);
        logOut('SseService', `Client connected for user ${userGuid} (total: ${this.clients.get(userGuid).size})`);
    }

    removeClient(userGuid, res) {
        const userClients = this.clients.get(userGuid);
        if (!userClients) return;
        userClients.delete(res);
        if (userClients.size === 0) {
            this.clients.delete(userGuid);
        }
        logOut('SseService', `Client disconnected for user ${userGuid}`);
    }

    broadcast(userGuid, eventName, data) {
        const userClients = this.clients.get(userGuid);
        if (!userClients || userClients.size === 0) return;

        const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
        userClients.forEach(res => {
            try {
                res.write(payload);
            } catch (err) {
                userClients.delete(res);
            }
        });
    }
}

module.exports = { SseService };
