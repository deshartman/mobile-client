/**
 * API Service for interacting with the server
 * Provides methods for fetching contacts and activities
 */

class ApiService {
    constructor() {
        this.baseUrl = window.location.origin;
    }

    /**
     * Fetch all contacts for a user
     * 
     * @param {string} userId - The user ID to fetch contacts for
     * @returns {Promise<Array>} - Promise resolving to an array of contacts
     */
    async fetchContacts(userId) {
        try {
            console.log(`[ApiService] Making GET request to /contacts/${userId}`);
            const response = await fetch(`${this.baseUrl}/contacts/${userId}`);

            console.log(`[ApiService] GET /contacts/${userId} - Response status: ${response.status}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log(`[ApiService] GET /contacts/${userId} - Response data:`, data);
            return data;
        } catch (error) {
            console.error(`[ApiService] Error fetching contacts for user ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Fetch all activities for a user
     * 
     * @param {string} userId - The user ID to fetch activities for
     * @returns {Promise<Array>} - Promise resolving to an array of activities
     */
    async fetchActivities(userId) {
        try {
            console.log(`[ApiService] Making GET request to /activities/${userId}`);
            const response = await fetch(`${this.baseUrl}/activities/${userId}`);

            console.log(`[ApiService] GET /activities/${userId} - Response status: ${response.status}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log(`[ApiService] GET /activities/${userId} - Response data:`, data);
            return data;
        } catch (error) {
            console.error(`[ApiService] Error fetching activities for user ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Fetch a single contact by ID
     * 
     * @param {string} userId - The user ID
     * @param {string} contactId - The contact ID to fetch
     * @returns {Promise<Object>} - Promise resolving to a contact object
     */
    async fetchContact(userId, contactId) {
        try {
            const response = await fetch(`${this.baseUrl}/contacts/${userId}/${contactId}`);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error fetching contact:', error);
            throw error;
        }
    }

    /**
     * Create a new contact
     * 
     * @param {string} userId - The user ID
     * @param {Object} contactData - The contact data to create
     * @returns {Promise<Object>} - Promise resolving to the created contact
     */
    async createContact(userId, contactData) {
        try {
            const response = await fetch(`${this.baseUrl}/contacts/${userId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(contactData)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error creating contact:', error);
            throw error;
        }
    }

    /**
     * Update an existing contact
     * 
     * @param {string} userId - The user ID
     * @param {string} contactId - The contact ID to update
     * @param {Object} contactData - The updated contact data
     * @returns {Promise<Object>} - Promise resolving to the updated contact
     */
    async updateContact(userId, contactId, contactData) {
        try {
            const response = await fetch(`${this.baseUrl}/contacts/${userId}/${contactId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(contactData)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error updating contact:', error);
            throw error;
        }
    }

    /**
     * Delete a contact
     * 
     * @param {string} userId - The user ID
     * @param {string} contactId - The contact ID to delete
     * @returns {Promise<boolean>} - Promise resolving to true if successful
     */
    async deleteContact(userId, contactId) {
        try {
            const response = await fetch(`${this.baseUrl}/contacts/${userId}/${contactId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return true;
        } catch (error) {
            console.error('Error deleting contact:', error);
            throw error;
        }
    }

    /**
     * Add a new activity
     * 
     * @param {string} userId - The user ID
     * @param {Object} activityData - The activity data to create
     * @returns {Promise<Object>} - Promise resolving to the created activity
     */
    async addActivity(userId, activityData) {
        try {
            const response = await fetch(`${this.baseUrl}/activities/${userId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(activityData)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error adding activity:', error);
            throw error;
        }
    }
}

// Export as a singleton
export default new ApiService();
