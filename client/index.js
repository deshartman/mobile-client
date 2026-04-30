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
 * Clear session and show signup/signin view (phone-OTP flow).
 */
async function showSignupView() {
    console.log('Showing signup view');

    sessionStorage.clear();

    const response = await fetch('/view/signup/signup.html');
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const html = await response.text();
    document.getElementById('app-root').innerHTML = html;

    // Inject signup stylesheet if not already present
    if (!document.querySelector('link[data-signup-css]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/view/signup/signup.css';
        link.dataset.signupCss = 'true';
        document.head.appendChild(link);
    }

    await import('/view/signup/signup.js');
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

// When someone lands on /signup (e.g. from the QR code), always show the
// signup/signin view — even if a stale session exists. This is the shared
// entry point for new and returning users.
const isSignupPath = window.location.pathname === '/signup';

try {
    if (isSignupPath || !userGUID) {
        console.log('Loading signup view (path=%s, userGUID=%s)', window.location.pathname, userGUID);
        await showSignupView();
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
            console.log('userGUID validation failed, clearing session and showing signup');
            await showSignupView();
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