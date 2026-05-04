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

const userGuid = sessionStorage.getItem('userGUID');
const remoteNumber = new URLSearchParams(window.location.search).get('number');

// Matches message.js helpers to the VoiceBootstrap convention: digits only, so
// "+61 401..." and "+61401..." compare equal.
const normalizePhone = (s) => (s || '').replace(/\D/g, '');

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
    messageContainer.querySelectorAll('.message').forEach(message => {
        message.style.display = 'flex';
    });
    toggleSearch(false);
});

function toggleSearch(show) {
    if (show) {
        contactNameContainer.style.display = 'none';
        searchContainer.style.display = 'block';
        topRow.classList.add('search-active');
        searchInput.focus();
    } else {
        contactNameContainer.style.display = 'block';
        searchContainer.style.display = 'none';
        topRow.classList.remove('search-active');
    }
}

searchToggleButton.addEventListener('click', () => {
    const isSearchVisible = searchContainer.style.display === 'block';
    toggleSearch(!isSearchVisible);
});

messageInput.addEventListener('input', function () {
    messageClearButton.style.display = this.value ? 'flex' : 'none';
});

messageClearButton.addEventListener('click', () => {
    messageInput.value = '';
    messageClearButton.style.display = 'none';
});

// Map Twilio delivery statuses to the short label we render on outbound
// bubbles. Inbound bubbles never get a status. `queued`/`accepted`/`sending`/
// `sent` all just mean "in flight" to the user — collapse to "Sending…" until
// we have confirmation.
function statusLabel(status) {
    if (!status) return '';
    switch (status) {
        case 'delivered':   return 'Delivered';
        case 'read':        return 'Read';
        case 'failed':
        case 'undelivered': return 'Failed';
        default:            return 'Sending…';
    }
}

/**
 * Build a message bubble. `messageSid` tags the DOM node so the SSE echo of
 * our own optimistic send can be deduped.
 */
function createMessageElement(content, isSent, { datetime, messageSid, status } = {}) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
    if (messageSid) messageDiv.dataset.messageSid = messageSid;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = content;

    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    const when = datetime ? new Date(datetime) : new Date();
    timeDiv.textContent = when.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });

    messageDiv.appendChild(contentDiv);
    messageDiv.appendChild(timeDiv);

    if (isSent) {
        const statusDiv = document.createElement('div');
        statusDiv.className = 'message-status';
        statusDiv.textContent = statusLabel(status);
        statusDiv.dataset.status = status || '';
        messageDiv.appendChild(statusDiv);
    }

    return messageDiv;
}

function appendMessage(msg) {
    // Guard against re-render on re-hydration (visibilitychange catch-up).
    if (msg.messageSid && messageContainer.querySelector(`[data-message-sid="${msg.messageSid}"]`)) {
        return;
    }
    const el = createMessageElement(msg.body, msg.direction === 'outbound', {
        datetime: msg.datetime,
        messageSid: msg.messageSid,
        status: msg.status
    });
    messageContainer.appendChild(el);
    messageContainer.scrollTop = messageContainer.scrollHeight;
}

// Update the status indicator on a previously-rendered outbound bubble.
// Called from the SSE `message.status` handler.
function updateMessageStatus(messageSid, status) {
    const bubble = messageContainer.querySelector(`[data-message-sid="${messageSid}"]`);
    if (!bubble) return;
    const statusEl = bubble.querySelector('.message-status');
    if (!statusEl) return;
    statusEl.textContent = statusLabel(status);
    statusEl.dataset.status = status || '';
}

// Pending optimistic sends (content string) keyed to allow dedup against
// webhook echoes that arrive before the send response resolves.
const pendingOutbound = new Set();

async function sendMessage() {
    const content = messageInput.value.trim();
    if (!content) return;

    // Optimistic render — SSE echo will replace the data-message-sid once known.
    const pendingKey = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimisticEl = createMessageElement(content, true, { messageSid: pendingKey, status: 'queued' });
    messageContainer.appendChild(optimisticEl);
    messageContainer.scrollTop = messageContainer.scrollHeight;
    pendingOutbound.add(content);

    messageInput.value = '';
    messageClearButton.style.display = 'none';

    const contactJson = sessionStorage.getItem('currentContact');
    let contactGuid = null;
    if (contactJson) {
        try { contactGuid = JSON.parse(contactJson).guid || null; } catch (e) { /* ignore */ }
    }

    try {
        const res = await fetch('/messaging/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userGuid, to: remoteNumber, body: content, contactGuid })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { messageSid, status } = await res.json();
        // Swap the pending key for the real SID so the SSE echo can dedupe.
        if (messageSid) optimisticEl.dataset.messageSid = messageSid;
        if (status) updateMessageStatus(messageSid, status);
    } catch (err) {
        console.error('[Message] Failed to send:', err);
        optimisticEl.classList.add('send-failed');
        updateMessageStatus(optimisticEl.dataset.messageSid, 'failed');
        pendingOutbound.delete(content);
    }
}

messageSendButton.addEventListener('click', sendMessage);

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

backButton.addEventListener('click', () => {
    window.location.href = '/index.html';
});

function getContactName() {
    const contactJson = sessionStorage.getItem('currentContact');
    if (contactJson) {
        try {
            const contact = JSON.parse(contactJson);
            return `${contact.firstName} ${contact.lastName}`.trim();
        } catch (e) {
            console.error('Error parsing contact from sessionStorage:', e);
        }
    }
    if (remoteNumber) return remoteNumber;
    return 'Contact';
}

// Tracked at module scope so the SSE `message.added` handler can also fire
// mark-read when a live inbound arrives while the thread is already open.
let currentThreadId = null;

function markThreadRead() {
    if (!userGuid || !currentThreadId) return;
    fetch(`/messaging/thread/${userGuid}/${currentThreadId}/read`, { method: 'POST' })
        .catch(err => console.warn('[Message] mark-read failed:', err));

    // Navigation back to the main list re-initializes that view from its
    // sessionStorage cache (5-min TTL) — the SSE `thread.read` event we
    // just triggered server-side won't help because the main list isn't
    // listening. Patch the cached row in-place so the dot clears on return.
    try {
        const cacheKey = `mainListCache:${userGuid}`;
        const cached = sessionStorage.getItem(cacheKey);
        if (!cached) return;
        const rows = JSON.parse(cached);
        const toDigits = (s) => (s || '').replace(/\D/g, '');
        const remoteDigits = toDigits(remoteNumber);
        for (const r of rows) {
            const matches = r.kind === 'contact'
                ? (r.identities || []).some(id => toDigits(id.value) === remoteDigits)
                : toDigits(r.identityValue) === remoteDigits;
            if (matches) r.unreadCount = 0;
        }
        sessionStorage.setItem(cacheKey, JSON.stringify(rows));
    } catch (err) {
        console.warn('[Message] Failed to patch main-list cache:', err);
    }
}

async function hydrateThread() {
    if (!userGuid || !remoteNumber) return;
    try {
        const res = await fetch(`/messaging/thread/${userGuid}?to=${encodeURIComponent(remoteNumber)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { threadId, messages } = await res.json();
        if (threadId) currentThreadId = threadId;
        messages.forEach(appendMessage);

        // Opening (or returning to) the thread clears any unread state.
        // The endpoint is idempotent — markedCount: 0 when there's nothing
        // to mark — so calling on every hydrate is safe.
        markThreadRead();
    } catch (err) {
        console.error('[Message] Failed to hydrate thread:', err);
    }
}

function subscribeToMessages() {
    if (!userGuid) return;
    // Reuse window.messageEventSource if the app already has one open; otherwise
    // create our own for the duration of this view. The EventSource carries its
    // own listener set across view navigations, so we must attach the listener
    // only once per EventSource — otherwise each re-entry adds another listener
    // and renders the same inbound message N times.
    const es = window.messageEventSource || new EventSource(`/events/${userGuid}`);
    if (!window.messageEventSource) window.messageEventSource = es;

    if (es._messageAddedBound) return;
    es._messageAddedBound = true;

    es.addEventListener('message.added', (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch (err) { return; }
        const currentRemote = new URLSearchParams(window.location.search).get('number');
        if (normalizePhone(msg.remoteAddress) !== normalizePhone(currentRemote)) return;

        // Dedup: if an optimistic bubble with this SID is already on screen, stop.
        if (msg.messageSid && messageContainer.querySelector(`[data-message-sid="${msg.messageSid}"]`)) {
            return;
        }
        // Dedup by body for the outbound case where the echo beat the POST response.
        if (msg.direction === 'outbound' && pendingOutbound.has(msg.body)) {
            pendingOutbound.delete(msg.body);
            const pending = messageContainer.querySelector('[data-message-sid^="pending-"].sent');
            if (pending) {
                pending.dataset.messageSid = msg.messageSid;
                return;
            }
        }
        appendMessage(msg);

        // Live inbound while the thread is open — user has seen it, so
        // clear the unread state server-side. First-message-of-new-thread
        // case: capture the threadId that hydrate didn't have yet.
        if (msg.direction === 'inbound') {
            if (msg.threadId && !currentThreadId) currentThreadId = msg.threadId;
            markThreadRead();
        }
    });

    es.addEventListener('message.status', (e) => {
        let payload;
        try { payload = JSON.parse(e.data); } catch (err) { return; }
        const currentRemote = new URLSearchParams(window.location.search).get('number');
        if (normalizePhone(payload.remoteAddress) !== normalizePhone(currentRemote)) return;
        updateMessageStatus(payload.messageSid, payload.status);
    });
}

// SSE can't survive mobile tab suspension — when the tab comes back to the
// foreground, re-hydrate to catch messages that arrived while hidden. The
// dedup guard in appendMessage prevents duplicates.
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        hydrateThread();
    }
});

// Initial setup
messageClearButton.style.display = 'none';
searchClearButton.style.display = 'none';
contactName.textContent = getContactName();
toggleSearch(false);

hydrateThread();
subscribeToMessages();
