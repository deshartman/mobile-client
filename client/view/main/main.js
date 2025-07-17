import ActivityList from '../../components/ActivityList/ActivityList.js';

// Function to load templates
async function loadTemplates() {
    try {
        // Load ActivityListItem template
        const itemResponse = await fetch('/components/ActivityListItem/ActivityListItem.html');
        if (!itemResponse.ok) {
            throw new Error(`HTTP error! status: ${itemResponse.status}`);
        }
        const itemHtml = await itemResponse.text();
        const itemParser = new DOMParser();
        const itemDoc = itemParser.parseFromString(itemHtml, 'text/html');
        const itemTemplate = itemDoc.querySelector('#activity-list-item');
        if (!itemTemplate) {
            throw new Error('ActivityListItem template not found in HTML');
        }
        document.body.appendChild(itemTemplate);

        // Load ActivityList templates
        const listResponse = await fetch('/components/ActivityList/ActivityList.html');
        if (!listResponse.ok) {
            throw new Error(`HTTP error! status: ${listResponse.status}`);
        }
        const listHtml = await listResponse.text();
        const listParser = new DOMParser();
        const listDoc = listParser.parseFromString(listHtml, 'text/html');
        
        // Append all ActivityList templates
        const templates = listDoc.querySelectorAll('template');
        templates.forEach(template => {
            document.body.appendChild(template);
        });

        return true;
    } catch (error) {
        console.error('Error loading templates:', error);
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
        // Wait for templates to load
        const templatesLoaded = await loadTemplates();
        if (!templatesLoaded) {
            throw new Error('Failed to load templates');
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
