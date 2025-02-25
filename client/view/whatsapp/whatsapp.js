// DOM Elements
const backButton = document.querySelector('.back-button');
const contactNameContainer = document.querySelector('.contact-name-container');
const contactName = document.querySelector('.contact-name');
const searchContainer = document.querySelector('.search-container');
const searchInput = document.querySelector('.search-input');
const searchClearButton = document.querySelector('.search-clear-button');
const searchToggleButton = document.querySelector('.search-toggle-button');
const topRow = document.querySelector('.top-row');
const messageInput = document.querySelector('.message-input');
const messageClearButton = document.querySelector('.message-clear-button');
const messageSendButton = document.querySelector('.message-send-button');
const messageContainer = document.querySelector('.message-container');

// Search functionality
searchInput.addEventListener('input', function () {
    searchClearButton.style.display = this.value ? 'flex' : 'none';

    const searchTerm = this.value.toLowerCase();
    const messages = messageContainer.querySelectorAll('.message');

    messages.forEach(message => {
        const content = message.querySelector('.message-content').textContent.toLowerCase();
        message.style.display = content.includes(searchTerm) ? 'flex' : 'none';
    });
});

searchClearButton.addEventListener('click', () => {
    searchInput.value = '';
    searchClearButton.style.display = 'none';
    // Show all messages
    messageContainer.querySelectorAll('.message').forEach(message => {
        message.style.display = 'flex';
    });
    // Hide search and show contact name
    toggleSearch(false);
});

// Search toggle functionality
function toggleSearch(show) {
    if (show) {
        // Hide contact name, show search
        contactNameContainer.style.display = 'none';
        searchContainer.style.display = 'block';
        topRow.classList.add('search-active');
        searchInput.focus();
    } else {
        // Show contact name, hide search
        contactNameContainer.style.display = 'block';
        searchContainer.style.display = 'none';
        topRow.classList.remove('search-active');
    }
}

// Toggle search when search button is clicked
searchToggleButton.addEventListener('click', () => {
    const isSearchVisible = searchContainer.style.display === 'block';
    toggleSearch(!isSearchVisible);
});

// Message input functionality
messageInput.addEventListener('input', function () {
    messageClearButton.style.display = this.value ? 'flex' : 'none';
});

messageClearButton.addEventListener('click', () => {
    messageInput.value = '';
    messageClearButton.style.display = 'none';
});

// Send message functionality
function createMessageElement(content, isSent) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = content;

    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    const now = new Date();
    timeDiv.textContent = now.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });

    messageDiv.appendChild(contentDiv);
    messageDiv.appendChild(timeDiv);

    return messageDiv;
}

function sendMessage() {
    const content = messageInput.value.trim();
    if (!content) return;

    const messageElement = createMessageElement(content, true);
    messageContainer.appendChild(messageElement);

    // Clear input and hide clear button
    messageInput.value = '';
    messageClearButton.style.display = 'none';

    // Scroll to bottom
    messageContainer.scrollTop = messageContainer.scrollHeight;
}

messageSendButton.addEventListener('click', sendMessage);

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Back button functionality
backButton.addEventListener('click', () => {
    window.location.href = '/index.html';
});

// Function to get contact name from URL or sessionStorage
function getContactName() {
    // Try to get contact from sessionStorage
    const contactJson = sessionStorage.getItem('currentContact');
    if (contactJson) {
        try {
            const contact = JSON.parse(contactJson);
            return `${contact.firstName} ${contact.lastName}`.trim();
        } catch (e) {
            console.error('Error parsing contact from sessionStorage:', e);
        }
    }

    // If no contact in sessionStorage, try to get from URL params
    const urlParams = new URLSearchParams(window.location.search);
    const number = urlParams.get('number');

    if (number) {
        return number;
    }

    // Default fallback
    return 'Contact';
}

// Initial setup
messageClearButton.style.display = 'none';
searchClearButton.style.display = 'none';

// Set contact name
contactName.textContent = getContactName();

// Initialize search toggle state
toggleSearch(false);

// Scroll to bottom initially
messageContainer.scrollTop = messageContainer.scrollHeight;
