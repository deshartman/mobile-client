import ActivityListItem from '../ActivityListItem/ActivityListItem.js';
import ApiService from '../../services/ApiService.js';

const CONTACT_UPDATED_EVENT = 'contactUpdated';

// Constants for localStorage keys
const USER_GUID_KEY = 'userGUID';

class ActivityList {
    constructor(containerElement) {
        this.containerElement = containerElement;
        this.activities = [];
        this.contacts = [];
        this.isLoading = false;
        this.hasError = false;
        this.errorMessage = '';

        // Get user ID from sessionStorage (we know it exists because index.html already checked)
        const userGUID = sessionStorage.getItem(USER_GUID_KEY);
        this.userId = userGUID;
        console.log('Using userGUID from sessionStorage:', userGUID);

        // Initialize template elements
        this.initializeTemplates();
    }

    // Initialize template elements from the loaded templates
    initializeTemplates() {
        // Clone templates and append to container
        const loadingTemplate = document.querySelector('#activity-list-loading');
        const errorTemplate = document.querySelector('#activity-list-error');
        const emptyTemplate = document.querySelector('#activity-list-empty');

        if (loadingTemplate) {
            this.loadingElement = loadingTemplate.content.cloneNode(true).firstElementChild;
            this.loadingElement.style.display = 'none';
            this.containerElement.appendChild(this.loadingElement);
        }

        if (errorTemplate) {
            this.errorElement = errorTemplate.content.cloneNode(true).firstElementChild;
            this.errorElement.style.display = 'none';
            this.containerElement.appendChild(this.errorElement);
        }

        if (emptyTemplate) {
            this.emptyElement = emptyTemplate.content.cloneNode(true).firstElementChild;
            this.emptyElement.style.display = 'none';
            this.containerElement.appendChild(this.emptyElement);
        }

        // Create activities container for dynamic content
        this.activitiesContainer = document.createElement('div');
        this.activitiesContainer.className = 'activities-container';
        this.containerElement.appendChild(this.activitiesContainer);
    }

    // Show loading state
    showLoading() {
        this.isLoading = true;
        this.hideAllStates();
        if (this.loadingElement) {
            this.loadingElement.style.display = 'block';
        }
    }

    // Show error state
    showError(message) {
        this.hasError = true;
        this.errorMessage = message;
        this.hideAllStates();

        if (this.errorElement) {
            // Update error message
            const errorText = this.errorElement.querySelector('.error-text');
            if (errorText) {
                errorText.textContent = message;
            }

            // Show error element
            this.errorElement.style.display = 'block';

            // Add retry button handler
            const retryButton = this.errorElement.querySelector('.retry-button');
            if (retryButton) {
                // Remove existing listeners to prevent duplicates
                retryButton.replaceWith(retryButton.cloneNode(true));
                const newRetryButton = this.errorElement.querySelector('.retry-button');
                newRetryButton.addEventListener('click', () => this.fetchData());
            }
        }
    }

    // Hide all state elements
    hideAllStates() {
        if (this.loadingElement) this.loadingElement.style.display = 'none';
        if (this.errorElement) this.errorElement.style.display = 'none';
        if (this.emptyElement) this.emptyElement.style.display = 'none';
        if (this.activitiesContainer) this.activitiesContainer.innerHTML = '';
    }

    // Fetch data from server
    async fetchData(forceRefresh = false) {
        this.showLoading();

        try {
            // Check if we should use cached data
            const cachedData = sessionStorage.getItem('activitiesCache');
            const cachedTimestamp = sessionStorage.getItem('activitiesCacheTimestamp');
            const now = Date.now();
            const dataAge = cachedTimestamp ? now - parseInt(cachedTimestamp) : Infinity;
            const maxAge = 5 * 60 * 1000; // 5 minutes in milliseconds

            // Use cached data if it's fresh enough and not forcing refresh
            if (!forceRefresh && cachedData && dataAge < maxAge) {
                console.log(`Using cached activities data from localStorage: ${cachedData}`);
                this.activities = JSON.parse(cachedData);
            } else {
                console.log('Fetching fresh activities data');
                // Fetch activities from server as they already include contact information
                const activities = await ApiService.fetchActivities(this.userId);
                console.log('Fetched activities:', activities);

                // Store activities
                this.activities = activities;

                // Cache the fresh data
                sessionStorage.setItem('activitiesCache', JSON.stringify(activities));
                sessionStorage.setItem('activitiesCacheTimestamp', now.toString());
            }

            // Sort activities by datetime
            this.activities.sort((a, b) => new Date(b.datetime) - new Date(a.datetime));

            // Reset error state
            this.hasError = false;
            this.errorMessage = '';

            // Render the list
            this.render();
        } catch (error) {
            console.error('Error fetching data:', error);
            this.showError('Failed to load activities. Please try again.');
        } finally {
            this.isLoading = false;
        }
    }

    // Add new activity for a contact - now using the API
    async addActivity(contact) {
        const phoneNumber = contact.identities.find(id => id.type === 'Phone')?.value;
        if (!phoneNumber) return;

        try {
            // Create new activity
            const newActivity = {
                type: 'Contact',
                datetime: new Date().toISOString(),
                duration: 0,
                identityValue: phoneNumber,
                contactGuid: contact.guid
            };

            // Send to server
            await ApiService.addActivity(this.userId, newActivity);

            // Refresh data from server
            await this.fetchData();
        } catch (error) {
            console.error('Error adding activity:', error);
            // Show error toast using template
            this.showErrorToast('Failed to add activity');
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
    async handleContactUpdate(event) {
        const { contact } = event.detail;

        // Add new activity for this contact
        await this.addActivity(contact);

        // Refresh data from server
        await this.fetchData();
    }

    // Show error toast using template
    showErrorToast(message) {
        const toastTemplate = document.querySelector('#activity-list-error-toast');
        if (toastTemplate) {
            const toastElement = toastTemplate.content.cloneNode(true).firstElementChild;
            const messageSpan = toastElement.querySelector('.toast-message');
            if (messageSpan) {
                messageSpan.textContent = message;
            }

            document.body.appendChild(toastElement);

            // Remove after 3 seconds
            setTimeout(() => {
                toastElement.remove();
            }, 3000);
        }
    }

    // Render the list with filtered activities
    render(searchTerm = '') {
        this.hideAllStates();
        const filteredActivities = this.filterActivities(searchTerm);

        if (filteredActivities.length === 0) {
            // Show empty state
            if (this.emptyElement) {
                this.emptyElement.style.display = 'block';
            }
        } else {
            // Render activities in the activities container
            if (this.activitiesContainer) {
                this.activitiesContainer.innerHTML = '';
                filteredActivities.forEach(activity => {
                    const listItem = new ActivityListItem(activity);
                    this.activitiesContainer.appendChild(listItem.render());
                });
            }
        }
    }

    // Initialize the component
    async initialize() {
        // Fetch data from server
        await this.fetchData();

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

        // Make the activity list available globally for refresh triggers
        window.activityList = this;

        // Set up visibility change listener to refresh data when app comes to foreground
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                // Check if data is stale and refresh if needed
                const cachedTimestamp = sessionStorage.getItem('activitiesCacheTimestamp');
                const now = Date.now();
                const dataAge = cachedTimestamp ? now - parseInt(cachedTimestamp) : Infinity;
                const maxAge = 5 * 60 * 1000; // 5 minutes in milliseconds

                if (dataAge > maxAge) {
                    console.log('Data is stale, refreshing...');
                    this.fetchData(true);
                }
            }
        });
    }
}

export default ActivityList;
