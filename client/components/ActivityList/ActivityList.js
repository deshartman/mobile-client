import ActivityListItem from '../ActivityListItem/ActivityListItem.js';
import ApiService from '../../services/ApiService.js';

const CONTACT_UPDATED_EVENT = 'contactUpdated';

// Constants for localStorage keys
const USER_GUID_KEY = 'userGUID';

class ActivityList {
    constructor(containerElement) {
        this.containerElement = containerElement;
        // Mixed roster rows: kind='contact' (known) or kind='unknown' (identity-only).
        // Server returns them pre-sorted (last-interacted DESC, then alphabetical).
        this.rows = [];
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

        // Create list container for dynamic content
        this.rowsContainer = document.createElement('div');
        this.rowsContainer.className = 'activities-container';
        this.containerElement.appendChild(this.rowsContainer);
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
        if (this.rowsContainer) this.rowsContainer.innerHTML = '';
    }

    // Cache keys scoped by userGUID so switching users in the same tab
    // doesn't leak user A's rows into user B's session.
    _cacheKey() { return `mainListCache:${this.userId}`; }
    _cacheTsKey() { return `mainListCacheTimestamp:${this.userId}`; }

    // Fetch data from server
    async fetchData(forceRefresh = false) {
        this.showLoading();

        try {
            const cachedData = sessionStorage.getItem(this._cacheKey());
            const cachedTimestamp = sessionStorage.getItem(this._cacheTsKey());
            const now = Date.now();
            const dataAge = cachedTimestamp ? now - Number.parseInt(cachedTimestamp) : Infinity;
            const maxAge = 5 * 60 * 1000;

            if (!forceRefresh && cachedData && dataAge < maxAge) {
                console.log('Using cached main-list data');
                this.rows = JSON.parse(cachedData);
            } else {
                console.log('Fetching fresh main-list data');
                const rows = await ApiService.fetchMainList(this.userId);
                console.log('Fetched main-list rows:', rows);
                this.rows = rows;
                sessionStorage.setItem(this._cacheKey(), JSON.stringify(rows));
                sessionStorage.setItem(this._cacheTsKey(), now.toString());
            }

            this.hasError = false;
            this.errorMessage = '';

            this.render();
        } catch (error) {
            console.error('Error fetching data:', error);
            this.showError('Failed to load contacts. Please try again.');
        } finally {
            this.isLoading = false;
        }
    }

    // Filter rows based on search term
    filterRows(searchTerm) {
        if (!searchTerm) {
            return this.rows;
        }

        const q = searchTerm.toLowerCase();
        return this.rows.filter(row => {
            if (row.kind === 'contact') {
                const fullName = `${row.firstName || ''} ${row.lastName || ''}`.toLowerCase();
                const company = row.company?.toLowerCase() || '';
                return fullName.includes(q) ||
                    company.includes(q) ||
                    (row.identities || []).some(id => id.value.toLowerCase().includes(q));
            }
            return (row.identityValue || '').toLowerCase().includes(q);
        });
    }

    // Re-sort rows in place using the same order the server applies:
    // last-interacted DESC (null last), then first_name/last_name alphabetical.
    sortRows() {
        this.rows.sort((a, b) => {
            const at = a.lastInteractedAt;
            const bt = b.lastInteractedAt;
            if (at && bt) {
                const diff = new Date(bt) - new Date(at);
                if (diff !== 0) return diff;
            } else if (at && !bt) {
                return -1;
            } else if (!at && bt) {
                return 1;
            }
            const af = (a.firstName || '').toLowerCase();
            const bf = (b.firstName || '').toLowerCase();
            if (af !== bf) return af.localeCompare(bf);
            const al = (a.lastName || '').toLowerCase();
            const bl = (b.lastName || '').toLowerCase();
            return al.localeCompare(bl);
        });
    }

    // Handle contact updates — just refetch; the server already seeded/updated the row.
    async handleContactUpdate() {
        await this.fetchData(true);
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

    // Render the list with filtered rows
    render(searchTerm = '') {
        this.hideAllStates();
        const filtered = this.filterRows(searchTerm);

        if (filtered.length === 0) {
            if (this.emptyElement) {
                this.emptyElement.style.display = 'block';
            }
        } else {
            if (this.rowsContainer) {
                this.rowsContainer.innerHTML = '';
                filtered.forEach(row => {
                    const listItem = new ActivityListItem(row);
                    this.rowsContainer.appendChild(listItem.render());
                });
            }
        }
    }

    subscribeToEvents() {
        if (!this.userId) return;
        const source = new EventSource(`/events/${this.userId}`);

        source.addEventListener('activity.added', (event) => {
            try {
                const activity = JSON.parse(event.data);
                console.log('[SSE] activity.added:', activity);

                let matched = false;
                if (activity.contactGuid) {
                    const row = this.rows.find(r => r.kind === 'contact' && r.guid === activity.contactGuid);
                    if (row) {
                        row.lastInteractedAt = activity.datetime;
                        matched = true;
                    }
                } else if (activity.identityValue) {
                    const row = this.rows.find(r => r.kind === 'unknown' && r.identityValue === activity.identityValue);
                    if (row) {
                        row.lastInteractedAt = activity.datetime;
                        matched = true;
                    }
                }

                if (!matched) {
                    // New contact linked server-side or first-ever activity from a new
                    // unknown number — refetch to pick up the new row.
                    this.fetchData(true);
                    return;
                }

                this.sortRows();
                sessionStorage.setItem(this._cacheKey(), JSON.stringify(this.rows));
                sessionStorage.setItem(this._cacheTsKey(), Date.now().toString());
                this.render();
            } catch (err) {
                console.error('[SSE] Failed to handle activity.added:', err);
            }
        });

        source.onerror = (err) => {
            console.warn('[SSE] connection error:', err);
        };

        this.eventSource = source;
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

        // Subscribe to server-sent events for real-time activity updates
        this.subscribeToEvents();

        // Always re-fetch on foreground. SSE can't survive mobile tab suspension;
        // events delivered while hidden are lost. The cheapest correct fix is to
        // treat the cache as disposable on visibility return.
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.fetchData(true);
            }
        });
    }
}

export default ActivityList;
