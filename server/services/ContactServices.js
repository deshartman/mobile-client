/**  
 * This service holds a Map of contacts based on the USer GUID. Each user will have a Map of contacts, where the key is the contact GUID and the value is the contact object.
 * 
 * 
 * The following methods are used for contact CRUD:
 * - getContacts: Returns all contacts in the Map
 * - getContact: Returns a single contact by GUID
 * - createContact: Adds a new contact to the Map
 * - updateContact: Updates an existing contact in the Map
 * - deleteContact: Removes a contact from the Map
 * 
 * 
 */
const EventEmitter = require('events');

class ContactService extends EventEmitter {
    constructor() {
        super();
        this.loadContacts();
    }

    /**
     * Load contacts from a data source. This will initially be just a local dummy data
     */
    loadContacts() {

        // We need a map of contacts referenced against a user GUID. Each user will be logging into the app and based on their e-mail address, they will have a Map of contacts only visible to them
        /**
         * The data structure will be something like this:
         * 
         * data = new Map {
         *    'userGUID': "dhartman@twilio.com,
         *      'contacts: new Map {
         *       'contact1': {
         *          guid: 'contact1',
         *         firstName: 'John',
         *        lastName: 'Doe',
         *      company: 'Twilio',
         *   identities: [
         *     { type: 'Phone', value: '+15555555555' },
         *  ]
         *} 
         * 
         */
        this.data = new Map();
        const userContacts = new Map();
        const contactsMap = new Map();

        // Add some initial contacts
        contactsMap.set('contact1', {
            guid: 'contact1',
            firstName: 'John',
            lastName: 'Doe',
            company: 'Twilio',
            identities: [
                { type: 'Phone', value: '+15555555555' },
            ],
        });
        contactsMap.set('contact2', {
            guid: 'contact2',
            firstName: 'Jane',
            lastName: 'Smith',
            company: 'Twilio',
            identities: [
                { type: 'Phone', value: '+15555555555' },
            ],
        });

        userContacts.set('contacts', contactsMap);
        this.data.set('sjahdfslaksjhd4897592834', userContacts);
    }

    /**
     * Get all contacts for a particular user
     * 
     * @param {string} userGUID GUID of the user to retrieve contacts
     * @returns {Map} Map of contacts
     * 
     */
    getContacts(userGUID) {
        this.contacts = this.data.get(userGUID).get('contacts');
        return this.contacts;
    }

    /**
     * Get a single contact by contactGUID for a particular users
     * 
     * @param {string} userGUID GUID of the user to retrieve contacts
     * @param {string} guid GUID of the contact to retrieve
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
     * @param {Object} contactGUID Contact object to update
     * @returns {Object} Updated contact object
     */
    updateContact(userGUID, contactGUID, contact) {
        this.contacts = this.data.get(userGUID).get('contacts');
        // update the particular contact
        this.contacts.set(contactGUID, contact);
        this.emit('contactUpdated', contactGUID);
        return contactGUID;
    }

    /**
     * Delete a contact  for a particular user
     * 
     * @param {string} userGUID GUID of the user to retrieve contacts
     * @param {string} guid GUID of the contact to delete
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
}

module.exports = { ContactService };
