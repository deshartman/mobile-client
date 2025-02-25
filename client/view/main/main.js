import ActivityList from '../../components/ActivityList/ActivityList.js';

// Function to load template
async function loadTemplate() {
    try {
        const response = await fetch('/components/ActivityListItem/ActivityListItem.html');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const template = doc.querySelector('#activity-list-item');
        if (!template) {
            throw new Error('Template not found in HTML');
        }
        document.body.appendChild(template);
        return true;
    } catch (error) {
        console.error('Error loading template:', error);
        return false;
    }
}

// Check if data is stale
function isDataStale() {
    const cachedTimestamp = sessionStorage.getItem('activitiesCacheTimestamp');
    if (!cachedTimestamp) return true;

    const now = Date.now();
    const dataAge = now - parseInt(cachedTimestamp);
    const maxAge = 5 * 60 * 1000; // 5 minutes in milliseconds

    return dataAge > maxAge;
}

// Initialize application
async function initializeApp() {
    try {
        // Wait for template to load
        const templateLoaded = await loadTemplate();
        if (!templateLoaded) {
            throw new Error('Failed to load template');
        }

        // Initialize activity list
        const listContainer = document.querySelector('.list-container');
        if (!listContainer) {
            throw new Error('List container not found');
        }

        const activityList = new ActivityList(listContainer);

        // Force refresh if data is stale
        const forceRefresh = isDataStale();
        await activityList.initialize();

        // If data was stale, force a refresh
        if (forceRefresh) {
            console.log('Data is stale on app start, refreshing...');
            activityList.fetchData(true);
        }

        // Set up add button handler
        const addButton = document.querySelector('.add-button');
        if (!addButton) {
            throw new Error('Add button not found');
        }

        addButton.addEventListener('click', () => {
            window.location.href = 'view/contact/contact.html';
        });

        // Add refresh button functionality if it exists
        const refreshButton = document.querySelector('.refresh-button');
        if (refreshButton) {
            refreshButton.addEventListener('click', async () => {
                // Add loading state
                const refreshIcon = refreshButton.querySelector('i');
                refreshButton.classList.add('loading');
                refreshButton.disabled = true;

                try {
                    // Fetch fresh data
                    await activityList.fetchData(true);
                } catch (error) {
                    console.error('Error refreshing data:', error);
                } finally {
                    // Remove loading state
                    refreshButton.classList.remove('loading');
                    refreshButton.disabled = false;
                }
            });
        }
    } catch (error) {
        console.error('Error initializing app:', error);
        // Show error to user
        const listContainer = document.querySelector('.list-container');
        if (listContainer) {
            listContainer.innerHTML = `<div class="error-message">Error loading application. Please refresh the page.</div>`;
        }
    }
}

// Start initialization when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeApp);
