import ApiService from '../../services/ApiService.js';

// Constants for sessionStorage keys
const USER_GUID_KEY = 'userGUID';
const USER_EMAIL_KEY = 'userEmail';
const USER_NAME_KEY = 'userName';

/**
 * Check if user is already logged in
 * @returns {boolean} True if user is logged in
 */
function isUserLoggedIn() {
    const userGUID = sessionStorage.getItem(USER_GUID_KEY);
    const userEmail = sessionStorage.getItem(USER_EMAIL_KEY);
    return !!userGUID && !!userEmail;
}

/**
 * Navigate to main view with the current user
 */
function navigateToMainView() {
    window.location.href = '/';
}

/**
 * Create a new user with the provided name and email
 * @param {string} name - User's name
 * @param {string} email - User's email
 * @returns {Promise<string>} - Promise resolving to the new user's GUID
 */
async function createNewUser(name, email) {
    try {
        // Create user data object
        const userData = {
            name: name,
            email: email,
            active: true,
            created: new Date().toISOString()
        };

        // Call API to create user
        const response = await fetch(`${window.location.origin}/users`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(userData)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Get the new user GUID from response
        const data = await response.json();
        return data.userGUID;
    } catch (error) {
        console.error('Error creating user:', error);
        throw error;
    }
}

/**
 * Save user data to sessionStorage
 * @param {string} userGUID - User's GUID
 * @param {string} email - User's email
 * @param {string} name - User's name
 */
function saveUserToSessionStorage(userGUID, email, name) {
    try {
        console.log('Saving to sessionStorage:', { userGUID, email, name });
        sessionStorage.setItem(USER_GUID_KEY, userGUID);
        sessionStorage.setItem(USER_EMAIL_KEY, email);
        sessionStorage.setItem(USER_NAME_KEY, name);

        // Verify data was saved
        const savedGUID = sessionStorage.getItem(USER_GUID_KEY);
        const savedEmail = sessionStorage.getItem(USER_EMAIL_KEY);
        const savedName = sessionStorage.getItem(USER_NAME_KEY);

        console.log('Verified sessionStorage data:', {
            savedGUID,
            savedEmail,
            savedName,
            success: savedGUID === userGUID && savedEmail === email && savedName === name
        });
    } catch (error) {
        console.error('Error saving to sessionStorage:', error);
    }
}

/**
 * Handle form submission
 * @param {Event} event - Form submit event
 */
async function handleFormSubmit(event) {
    event.preventDefault();

    // Get form values
    const nameInput = document.getElementById('name');
    const emailInput = document.getElementById('email');
    const name = nameInput.value.trim();
    const email = emailInput.value.trim();

    // Validate inputs
    if (!name || !email) {
        showError('Please enter both name and email');
        return;
    }

    // Disable button and show loading
    const loginButton = document.getElementById('login-button');
    loginButton.disabled = true;
    loginButton.textContent = 'Loading...';

    try {
        // Create new user
        const userGUID = await createNewUser(name, email);

        // Save user data to sessionStorage
        saveUserToSessionStorage(userGUID, email, name);

        // Navigate to main view
        navigateToMainView();
    } catch (error) {
        console.error('Login error:', error);
        showError('Failed to create user. Please try again.');

        // Re-enable button
        loginButton.disabled = false;
        loginButton.textContent = 'Continue';
    }
}

/**
 * Show error message
 * @param {string} message - Error message to display
 */
function showError(message) {
    // Check if error element already exists
    let errorElement = document.getElementById('login-error');

    // Create error element if it doesn't exist
    if (!errorElement) {
        errorElement = document.createElement('div');
        errorElement.id = 'login-error';
        errorElement.className = 'error-message';
        const form = document.getElementById('login-form');
        form.appendChild(errorElement);
    }

    // Set error message
    errorElement.textContent = message;
}

/**
 * Initialize the login view
 */
async function initializeLoginView() {
    const loadingIndicator = document.getElementById('loading-indicator');
    const loginForm = document.getElementById('login-form');

    try {
        // Check if user is already logged in
        if (isUserLoggedIn()) {
            // User is logged in, navigate to main view
            navigateToMainView();
            return;
        }

        // User is not logged in, show login form
        loadingIndicator.style.display = 'none';
        loginForm.style.display = 'block';

        // Add form submit handler
        const loginButton = document.getElementById('login-button');
        loginButton.addEventListener('click', handleFormSubmit);
    } catch (error) {
        console.error('Error initializing login view:', error);
        loadingIndicator.style.display = 'none';

        // Show error message
        const loginContainer = document.querySelector('.login-container');
        loginContainer.innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-circle"></i>
                <span>Error loading application. Please refresh the page.</span>
            </div>
        `;
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeLoginView);
