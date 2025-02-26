import ActivityListItem from '../ActivityListItem/ActivityListItem.js';
import ApiService from '../../services/ApiService.js';

const CONTACT_UPDATED_EVENT = 'contactUpdated';

// Default user ID for demo purposes. TODO: Remove this when the login window is sorted out
const DEFAULT_USER_ID = '6fdf6ffc-ed77-94fa-407e-a7b86ed9e59d'; // John Doe

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

        // Get user ID from localStorage or redirect to login if not found
        let userGUID = localStorage.getItem(USER_GUID_KEY);
        console.log('Check userGUID from local storage: ', userGUID);
        if (!userGUID) {
            // If there is no userGUID in localStorage, we need to present the login window to the user
            // The user then enters detail and we build a new user on the server and store the userGUID in localStorage
            // Temp hack to use default user for now
            userGUID = DEFAULT_USER_ID;
            console.log('No user GUID found in localStorage, switching to default user: ', userGUID);
        }

        this.userId = userGUID;
        console.log('The suer ID now is userGUID: ', userGUID);

    }

    // Show loading state
    showLoading() {
        this.isLoading = true;
        this.containerElement.innerHTML = `
            <div class="loading-indicator">
                <i class="fas fa-spinner fa-spin"></i>
                <span>Loading activities...</span>
            </div>
        `;
    }

    // Show error state
    showError(message) {
        this.hasError = true;
        this.errorMessage = message;
        this.containerElement.innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-circle"></i>
                <span>${message}</span>
                <button class="retry-button">Retry</button>
            </div>
        `;

        // Add retry button handler
        const retryButton = this.containerElement.querySelector('.retry-button');
        if (retryButton) {
            retryButton.addEventListener('click', () => this.fetchData());
        }
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
                console.log('Using cached activities data');
                this.activities = JSON.parse(cachedData);
            } else {
                console.log('Fetching fresh activities data');
                // Fetch activities from server as they already include contact information
                const activities = await ApiService.fetchActivities(this.userId);

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
                type: 'Phone',
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
            // Show error message but don't disrupt the UI
            const errorToast = document.createElement('div');
            errorToast.className = 'error-toast';
            errorToast.textContent = 'Failed to add activity';
            document.body.appendChild(errorToast);

            // Remove after 3 seconds
            setTimeout(() => {
                errorToast.remove();
            }, 3000);
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
