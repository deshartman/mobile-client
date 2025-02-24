// DOM Elements
const backButton = document.querySelector('.back-button');
const searchInput = document.querySelector('.search-input');
const searchClearButton = document.querySelector('.search-clear-button');
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

// Initial setup
messageClearButton.style.display = 'none';
searchClearButton.style.display = 'none';

// Scroll to bottom initially
messageContainer.scrollTop = messageContainer.scrollHeight;
