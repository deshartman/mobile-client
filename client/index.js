/**
 * Validate user session with server
 * @param {string} userGUID - User GUID to validate
 * @returns {Promise<boolean>} True if user is valid
 */
async function validateUserSession(userGUID) {
    try {
        const response = await fetch(`/users/${userGUID}`);
        return response.ok; // Returns true if status is 200-299
    } catch (error) {
        console.error('Error validating user session:', error);
        return false;
    }
}

/**
 * Clear session and show login view
 */
async function showLoginView() {
    console.log('Showing login view');
    
    // Clear all session data
    sessionStorage.clear();
    
    // Load and inject login HTML content
    const response = await fetch('/view/login/login.html');
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const html = await response.text();
    document.getElementById('app-root').innerHTML = html;
    
    // Import login.js after HTML content is loaded
    await import('/view/login/login.js');
}

/**
 * Show main view for authenticated user
 */
async function showMainView() {
    console.log('userGUID validated, loading main view');
    
    // Load and inject main HTML content
    const response = await fetch('/view/main/main.html');
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const html = await response.text();
    document.getElementById('app-root').innerHTML = html;
    
    // Import main.js after HTML content is loaded
    await import('/view/main/main.js');
}

// Check if user is logged in and validate with server
const userGUID = sessionStorage.getItem('userGUID');

try {
    if (!userGUID) {
        // No user found, load login view
        console.log('No userGUID found in sessionStorage, loading login view');
        await showLoginView();
    } else {
        // User found in session, validate with server
        console.log('userGUID found in sessionStorage, validating with server:', userGUID);
        const isValidUser = await validateUserSession(userGUID);
        
        if (isValidUser) {
            // Valid user, load main view
            await showMainView();
            // Register Twilio Device app-wide so inbound calls ring from any screen
            if (window.bootstrapVoice) {
                window.bootstrapVoice(userGUID);
            }
        } else {
            // Invalid user, clear session and show login
            console.log('userGUID validation failed, clearing session and showing login');
            await showLoginView();
        }
    }
    
    // Dispatch DOMContentLoaded to trigger initialization
    // This ensures both the module and HTML content are ready
    document.dispatchEvent(new Event('DOMContentLoaded'));
} catch (error) {
    console.error('Error loading application:', error);
    document.getElementById('app-root').innerHTML = `
    <div class="error-message">Error loading application. Please refresh the page.</div>
    `;
}