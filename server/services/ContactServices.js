/**  
 * This service holds a Map of contacts based on the User GUID. Each user will have a Map of contacts, where the key is the contact GUID and the value is the contact object.
 * It also manages activities related to contacts.
 * 
 * The following methods are used for contact CRUD:
 * - getContacts: Returns all contacts in the Map
 * - getContact: Returns a single contact by GUID
 * - createContact: Adds a new contact to the Map
 * - updateContact: Updates an existing contact in the Map
 * - deleteContact: Removes a contact from the Map
 * 
 * The following methods are used for activities:
 * - getActivities: Returns all activities for a user
 * - addActivity: Adds a new activity for a user
 */
const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

class ContactService extends EventEmitter {
    constructor() {
        super();
        this.loadContacts();
        this.loadActivities();
    }

    /**
     * Load contacts from a data source. This will initially be just a local dummy data
     */
    loadContacts() {
        // We need a map of contacts referenced against a user GUID. Each user will be logging into the app and based on their e-mail address, they will have a Map of contacts only visible to them
        this.data = new Map();

        // User IDs from UserServices.js
        const userIds = [
            '6fdf6ffc-ed77-94fa-407e-a7b86ed9e59d',  // John Doe
            '6fdf6ffc-ed77-94fa-407e-a7b86ed9exxx'   // Jane Smith
        ];

        // For each user, create a contacts map
        userIds.forEach(userId => {
            const userContacts = new Map();
            const contactsMap = new Map();

            // Add contacts for John Doe
            if (userId === '6fdf6ffc-ed77-94fa-407e-a7b86ed9e59d') {
                contactsMap.set('contact-1', {
                    guid: 'contact-1',
                    firstName: 'Emma',
                    lastName: 'Thompson',
                    company: 'Tech Corp',
                    identities: [
                        { type: 'Phone', value: '+1 (555) 444-3333' },
                        { type: 'WhatsApp', value: '+1 (555) 444-3333' }
                    ]
                });

                contactsMap.set('contact-2', {
                    guid: 'contact-2',
                    firstName: 'Michael',
                    lastName: 'Chen',
                    company: 'Innovation Labs',
                    identities: [
                        { type: 'Phone', value: '+1 (555) 555-5555' },
                        { type: 'Message', value: '+1 (555) 555-5555' }
                    ]
                });

                contactsMap.set('contact-3', {
                    guid: 'contact-3',
                    firstName: 'John',
                    lastName: 'Smith',
                    company: 'Acme Corp',
                    identities: [
                        { type: 'Phone', value: '+1 (555) 666-6666' },
                        { type: 'Message', value: '+1 (555) 666-6666' },
                        { type: 'WhatsApp', value: '+1 (555) 666-6666' }
                    ]
                });

                contactsMap.set('contact-4', {
                    guid: 'contact-4',
                    firstName: 'Sarah',
                    lastName: 'Johnson',
                    company: 'Global Solutions',
                    identities: [
                        { type: 'Phone', value: '+1 (555) 777-7777' },
                        { type: 'WhatsApp', value: '+1 (555) 777-7777' }
                    ]
                });
            }

            // Add contacts for Jane Smith
            if (userId === '6fdf6ffc-ed77-94fa-407e-a7b86ed9exxx') {
                contactsMap.set('contact-5', {
                    guid: 'contact-5',
                    firstName: 'David',
                    lastName: 'Wilson',
                    company: 'Startup Inc',
                    identities: [
                        { type: 'Phone', value: '+1 (555) 888-8888' },
                        { type: 'Message', value: '+1 (555) 888-8888' }
                    ]
                });

                contactsMap.set('contact-6', {
                    guid: 'contact-6',
                    firstName: 'Lisa',
                    lastName: 'Brown',
                    company: 'Creative Design',
                    identities: [
                        { type: 'Phone', value: '+1 (555) 999-9999' },
                        { type: 'WhatsApp', value: '+1 (555) 999-9999' }
                    ]
                });
            }

            userContacts.set('contacts', contactsMap);
            this.data.set(userId, userContacts);
        });
    }

    /**
     * Load activities data
     */
    loadActivities() {
        this.activities = new Map();

        // User IDs from UserServices.js
        const userIds = [
            '6fdf6ffc-ed77-94fa-407e-a7b86ed9e59d',  // John Doe
            '6fdf6ffc-ed77-94fa-407e-a7b86ed9exxx'   // Jane Smith
        ];

        // For each user, create activities
        userIds.forEach(userId => {
            const userActivities = [];

            // Add activities for John Doe
            if (userId === '6fdf6ffc-ed77-94fa-407e-a7b86ed9e59d') {
                userActivities.push({
                    id: uuidv4(),
                    type: 'Phone',
                    datetime: '2025-02-23T01:15:00',
                    duration: 45,
                    identityValue: '+1 (555) 444-3333',
                    contactGuid: 'contact-1'
                });

                userActivities.push({
                    id: uuidv4(),
                    type: 'Message',
                    datetime: '2025-02-22T10:30:00',
                    duration: 15,
                    identityValue: '+1 (555) 555-5555',
                    contactGuid: 'contact-2'
                });

                userActivities.push({
                    id: uuidv4(),
                    type: 'WhatsApp',
                    datetime: '2025-02-22T09:15:00',
                    duration: 30,
                    identityValue: '+1 (555) 666-6666',
                    contactGuid: 'contact-3'
                });

                userActivities.push({
                    id: uuidv4(),
                    type: 'Phone',
                    datetime: '2025-02-22T08:45:00',
                    duration: 25,
                    identityValue: '+1 (555) 777-7777',
                    contactGuid: 'contact-4'
                });

                userActivities.push({
                    id: uuidv4(),
                    type: 'WhatsApp',
                    datetime: '2025-02-21T14:20:00',
                    duration: 18,
                    identityValue: '+1 (555) 444-3333',
                    contactGuid: 'contact-1'
                });

                userActivities.push({
                    id: uuidv4(),
                    type: 'Phone',
                    datetime: '2025-02-21T11:05:00',
                    duration: 32,
                    identityValue: '+1 (555) 666-6666',
                    contactGuid: 'contact-3'
                });
            }

            // Add activities for Jane Smith
            if (userId === '6fdf6ffc-ed77-94fa-407e-a7b86ed9exxx') {
                userActivities.push({
                    id: uuidv4(),
                    type: 'Phone',
                    datetime: '2025-02-23T02:30:00',
                    duration: 28,
                    identityValue: '+1 (555) 888-8888',
                    contactGuid: 'contact-5'
                });

                userActivities.push({
                    id: uuidv4(),
                    type: 'WhatsApp',
                    datetime: '2025-02-22T15:45:00',
                    duration: 22,
                    identityValue: '+1 (555) 999-9999',
                    contactGuid: 'contact-6'
                });
            }

            this.activities.set(userId, userActivities);
        });
    }

    /**
     * Get all contacts for a particular user
     * 
     * @param {string} userGUID GUID of the user to retrieve contacts
     * @returns {Map} Map of contacts
     */
    getContacts(userGUID) {
        this.contacts = this.data.get(userGUID).get('contacts');
        return this.contacts;
    }

    /**
     * Get a single contact by contactGUID for a particular user
     * 
     * @param {string} userGUID GUID of the user to retrieve contacts
     * @param {string} contactGUID GUID of the contact to retrieve
     * @returns {Object} Contact object
     */
    getContact(userGUID, contactGUID) {
        this.contacts = this.data.get(userGUID).get('contacts');
        return this.contacts.get(contactGUID);
    }

    /**
     * Create a new contact for a particular user
     * 
     * @param {string} userGUID GUID of the user to retrieve contacts
     * @param {Object} contact Contact object to create
     * @returns {Object} Created contact object
     */
    createContact(userGUID, contact) {
        this.contacts = this.data.get(userGUID).get('contacts');
        // Create a new contact GUID and add the contact data
        contact.guid = `contact-${Date.now()}`;
        this.contacts.set(contact.guid, contact);
        this.emit('contactCreated', contact);
        return contact;
    }

    /**
     * Update an existing contact for a particular user
     * 
     * @param {string} userGUID GUID of the user to retrieve contacts
     * @param {string} contactGUID GUID of the contact to update
     * @param {Object} contact Contact object with updated data
     * @returns {string} Updated contact GUID
     */
    updateContact(userGUID, contactGUID, contact) {
        this.contacts = this.data.get(userGUID).get('contacts');
        // update the particular contact
        this.contacts.set(contactGUID, contact);
        this.emit('contactUpdated', contactGUID);
        return contactGUID;
    }

    /**
     * Delete a contact for a particular user
     * 
     * @param {string} userGUID GUID of the user to retrieve contacts
     * @param {string} contactGUID GUID of the contact to delete
     * @returns {boolean} True if the contact was deleted
     */
    deleteContact(userGUID, contactGUID) {
        this.contacts = this.data.get(userGUID).get('contacts');
        const deleted = this.contacts.delete(contactGUID);
        if (deleted) {
            this.emit('contactDeleted', contactGUID);
        }
        return deleted;
    }
    /**
     * Get all activities for a particular user
     * 
     * @param {string} userGUID GUID of the user to retrieve activities
     * @returns {Array} Array of activities
     */
    getActivities(userGUID) {
        const activities = this.activities.get(userGUID) || [];
        const contacts = this.data.get(userGUID)?.get('contacts');

        // Enrich activities with contact information
        return activities.map(activity => {
            const contact = contacts?.get(activity.contactGuid);
            return {
                ...activity,
                contact: contact || null
            };
        });
    }

    /**
     * Add a new activity for a user
     * 
     * @param {string} userGUID GUID of the user
     * @param {Object} activity Activity object to add
     * @returns {Object} Added activity object
     */
    addActivity(userGUID, activity) {
        const userActivities = this.activities.get(userGUID) || [];

        // Add ID to activity
        activity.id = uuidv4();

        // Add to beginning of activities array (most recent first)
        userActivities.unshift(activity);

        // Update activities map
        this.activities.set(userGUID, userActivities);

        // Emit event
        this.emit('activityAdded', activity);

        return activity;
    }
}

module.exports = { ContactService };
