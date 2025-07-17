// Check if user is logged in
const userGUID = localStorage.getItem('userGUID');

try {
    if (!userGUID) {
        // No user found, load login view
        console.log('No userGUID found in localStorage, loading login view');
        
        // Load and inject login HTML content
        const response = await fetch('/view/login/login.html');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const html = await response.text();
        document.getElementById('app-root').innerHTML = html;
        
        // Import login.js after HTML content is loaded
        await import('/view/login/login.js');
    } else {
        // User found, load main view
        console.log('userGUID found in localStorage, loading main view');
        
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
    
    // Dispatch DOMContentLoaded to trigger initialization
    // This ensures both the module and HTML content are ready
    document.dispatchEvent(new Event('DOMContentLoaded'));
} catch (error) {
    console.error('Error loading application:', error);
    document.getElementById('app-root').innerHTML = `
    <div class="error-message">Error loading application. Please refresh the page.</div>
    `;
}