import ActivityListItem from '../ActivityListItem/ActivityListItem.js';

const CONTACT_UPDATED_EVENT = 'contactUpdated';

// Sample contacts for initial data
const SAMPLE_CONTACTS = {
    '+1 (555) 444-3333': {
        guid: 'contact-1',
        firstName: 'Emma',
        lastName: 'Thompson',
        company: 'Tech Corp',
        identities: [
            { type: 'Phone', value: '+1 (555) 444-3333' },
            { type: 'WhatsApp', value: '+1 (555) 444-3333' }
        ]
    },
    '+1 (555) 555-5555': {
        guid: 'contact-2',
        firstName: 'Michael',
        lastName: 'Chen',
        company: 'Innovation Labs',
        identities: [
            { type: 'Phone', value: '+1 (555) 555-5555' },
            { type: 'Message', value: '+1 (555) 555-5555' }
        ]
    },
    '+1 (555) 666-6666': {
        guid: 'contact-3',
        firstName: 'John',
        lastName: 'Smith',
        company: 'Acme Corp',
        identities: [
            { type: 'Phone', value: '+1 (555) 666-6666' },
            { type: 'Message', value: '+1 (555) 666-6666' },
            { type: 'WhatsApp', value: '+1 (555) 666-6666' }
        ]
    }
};

// Sample activities for initial data
const SAMPLE_ACTIVITIES = [
    {
        type: 'Phone',
        datetime: '2025-02-23T01:15:00',
        duration: 45,
        identityValue: '+1 (555) 444-3333'
    },
    {
        type: 'Message',
        datetime: '2025-02-22T10:30:00',
        duration: 15,
        identityValue: '+1 (555) 555-5555'
    },
    {
        type: 'WhatsApp',
        datetime: '2025-02-22T09:15:00',
        duration: 30,
        identityValue: '+1 (555) 666-6666'
    },
    {
        type: 'Phone',
        datetime: '2025-02-22T08:45:00',
        duration: 25,
        identityValue: '+1 (555) 777-7777'
    }
];

class ActivityList {
    constructor(containerElement) {
        this.containerElement = containerElement;
        this.activities = [];
        this.contacts = new Map();
    }

    // Initialize sample data if none exists
    initializeSampleData() {
        const storedContacts = localStorage.getItem('contacts');
        const storedActivities = localStorage.getItem('activities');

        if (!storedContacts) {
            localStorage.setItem('contacts', JSON.stringify(SAMPLE_CONTACTS));
        }

        if (!storedActivities) {
            const activities = SAMPLE_ACTIVITIES.map(activity => {
                const contact = SAMPLE_CONTACTS[activity.identityValue];
                return {
                    ...activity,
                    contact: contact || null
                };
            });
            localStorage.setItem('activities', JSON.stringify(activities));
        }
    }

    // Load contacts from localStorage
    loadContacts() {
        const storedContacts = JSON.parse(localStorage.getItem('contacts') || '{}');
        this.contacts = new Map(Object.entries(storedContacts));
    }

    // Load activities from localStorage
    loadActivities() {
        const storedActivities = JSON.parse(localStorage.getItem('activities') || '[]');

        // Update activities with current contact information
        this.activities = storedActivities.map(activity => {
            const contact = Array.from(this.contacts.values()).find(c =>
                c.identities.some(id => id.value === activity.identityValue)
            );
            return {
                ...activity,
                contact: contact || null
            };
        });

        // Sort activities by datetime
        this.activities.sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
    }

    // Add new activity for a contact
    addActivity(contact) {
        const phoneNumber = contact.identities.find(id => id.type === 'Phone')?.value;
        if (!phoneNumber) return;

        // Check if activity already exists
        const existingActivity = this.activities.find(a => a.identityValue === phoneNumber);
        if (!existingActivity) {
            // Create new activity
            const newActivity = {
                type: 'Phone',
                contact: contact,
                datetime: new Date().toISOString(),
                duration: 0,
                identityValue: phoneNumber
            };

            // Add to beginning of activities array
            this.activities.unshift(newActivity);

            // Update localStorage
            localStorage.setItem('activities', JSON.stringify(this.activities));
        }
    }

    // Filter activities based on search term
    filterActivities(searchTerm) {
        if (!searchTerm) {
            return this.activities;
        }

        const searchString = searchTerm.toLowerCase();
        return this.activities.filter(activity => {
            if (activity.contact) {
                const fullName = `${activity.contact.firstName} ${activity.contact.lastName}`.toLowerCase();
                const company = activity.contact.company?.toLowerCase() || '';
                return fullName.includes(searchString) ||
                    company.includes(searchString) ||
                    activity.contact.identities.some(id => id.value.includes(searchString));
            }
            return activity.identityValue.includes(searchString);
        });
    }

    // Handle contact updates
    handleContactUpdate(event) {
        const { contact } = event.detail;

        // Update contacts
        this.loadContacts();

        // Add new activity for this contact
        this.addActivity(contact);

        // Reload activities to update any existing ones
        this.loadActivities();

        // Re-render the list
        this.render();
    }

    // Render the list with filtered activities
    render(searchTerm = '') {
        this.containerElement.innerHTML = '';
        const filteredActivities = this.filterActivities(searchTerm);

        filteredActivities.forEach(activity => {
            const listItem = new ActivityListItem(activity);
            this.containerElement.appendChild(listItem.render());
        });
    }

    // Initialize the component
    initialize() {
        // Initialize sample data if needed
        this.initializeSampleData();

        // Load data
        this.loadContacts();
        this.loadActivities();

        // Initial render
        this.render();

        // Set up search functionality
        const searchInput = document.querySelector('.search-input');
        const clearButton = document.querySelector('.search-clear-button');

        if (searchInput && clearButton) {
            searchInput.addEventListener('input', (e) => {
                const value = e.target.value;
                this.render(value);
                clearButton.style.display = value ? 'flex' : 'none';
            });

            clearButton.addEventListener('click', () => {
                searchInput.value = '';
                clearButton.style.display = 'none';
                this.render();
            });
        }

        // Listen for contact updates
        window.addEventListener(CONTACT_UPDATED_EVENT, this.handleContactUpdate.bind(this));
    }
}

export default ActivityList;
