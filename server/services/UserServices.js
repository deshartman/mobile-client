/**  
 * This service is used to control access for users to the client application. Each user needs an identifier, usually their email address, to access the application.
 * We will generate a userGUID to identify them and store the associated details in a Map
 * 
 * 
 * The following methods are used for user CRUD:
 * - getUser: Returns a single user by GUID
 * - createUser: Adds a new user to the Map and generates and returns a userGUID
 * - updateUser: Updates an existing user in the Map
 * - deleteUser: Removes a user from the Map
 * 
 */
const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const { logOut } = require('../utils/logger');

class UserService extends EventEmitter {
    constructor() {
        super();
        this.loadUsers();
    }

    /**
     * Load users from a data source. TODO: This will initially be just a local dummy data, but any source in the future
     */
    loadUsers() {
        // We need a map of users referenced against a user GUID. Each user will be logging into the app and based on their email address, they will have a Map of users only visible to them
        /**
         * The data structure will be something like this:
         * 
         * data = new Map {
         *    'userGUID': "dhartman@twilio.com,
         *     'name": "Des Hartman",
         *     'email': "dhartman@twilio.com",
         *     'active': true,
         *    'created': "2021-09-01T00:00:00Z"
         *} 
         * 
         */
        this.users = new Map();
        this.users.set('6fdf6ffc-ed77-94fa-407e-a7b86ed9e59d', {
            name: 'John Doe',
            email: 'john.doe@example.com',
            active: true,
            created: '2021-09-01T00:00:00Z',
        });
        this.users.set('6fdf6ffc-ed77-94fa-407e-a7b86ed9exxx', {
            name: 'Jane Smith',
            email: 'jane.smith@example.com',
            active: true,
            created: '2021-09-01T00:00:00Z',
        });
        this.users.set('14310e20-4416-40bc-aeb8-daf093f2ed90', {
            name: 'Des Hartman',
            email: 'dhartman@twilio.com',
            active: true,
            created: '2021-09-01T00:00:00Z',
        });
        // logOut('User Service', `Users: ${JSON.stringify(Object.fromEntries(this.users), null, 4)}`);
    }

    /**
     * Create a new user
     * 
     * @param {*} user User object to create
     * @returns {string} GUID of the created user
     * 
     */
    createUser(userData) {
        // Generate a GUID using a guid library
        const guid = uuidv4();
        // Store user data without the guid property since it's used as the key
        this.users.set(guid, userData);
        logOut('User Service', `Created user: ${guid} with Userdata: ${JSON.stringify(userData, null, 4)}`);
        return guid;
    }

    /**
     * Get all users for a particular user
     * 
     * @param {string} userGUID GUID of the user to retrieve
     * @returns {*} User object
     * 
     */
    getUser(userGUID) {
        logOut('User Service', `Getting user ${userGUID}`);
        // logOut('User Service', `Users: ${JSON.stringify(Object.fromEntries(this.users), null, 4)}`);

        const user = this.users.get(userGUID);
        logOut('User Service', `User: ${JSON.stringify(user, null, 4)}`);
        return user;
    }

    /**
     * Get user by email address
     * 
     * @param {string} email Email address to search for
     * @returns {Object|null} Object with {userGUID, userData} if found, null if not found
     */
    getUserByEmail(email) {
        logOut('User Service', `Getting user by email: ${email}`);
        
        for (const [userGUID, userData] of this.users.entries()) {
            if (userData.email === email) {
                logOut('User Service', `Found existing user for email ${email}: ${userGUID}`);
                return { userGUID, userData };
            }
        }
        
        logOut('User Service', `No user found for email: ${email}`);
        return null;
    }

    /**
     * Update an existing user
     * 
     * @param {string} userGUID GUID of the user to update
     * @param {*} user User object with updated details
     * 
     */
    updateUser(userGUID, user) {
        this.users.set(userGUID, user);
        return user;
    }

    /**
     * Delete a user
     * 
     * @param {string} userGUID GUID of the user to delete
     * 
     */
    deleteUser(userGUID) {
        this.users.delete(userGUID);
        return userGUID;
    }

}

module.exports = { UserService };
