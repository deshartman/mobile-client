document.addEventListener('DOMContentLoaded', async () => {
    // A call completing will add a Phone activity server-side. Invalidate the
    // main view's cache so the next load fetches fresh data and includes this
    // call — the SSE activity.added event fires while this page is still open
    // and misses the main view.
    sessionStorage.removeItem('mainListCacheTimestamp');
    sessionStorage.removeItem('mainListCache');

    const number = new URLSearchParams(window.location.search).get('number');
    const contactJson = sessionStorage.getItem('currentContact');
    const userGuid = sessionStorage.getItem('userGUID');

    let contactGuid = null;
    if (contactJson) {
        try { contactGuid = JSON.parse(contactJson).guid || null; } catch (e) { /* ignore */ }
    }

    // ---- Populate contact display ----
    const contactNameElement = document.querySelector('.contact-name');
    const companyNameElement = document.querySelector('.company-name');
    if (contactJson) {
        try {
            const contact = JSON.parse(contactJson);
            if (contactNameElement) {
                contactNameElement.textContent = `${contact.firstName} ${contact.lastName}`.trim();
            }
            if (companyNameElement) {
                companyNameElement.textContent = contact.company || '';
            }
        } catch (error) {
            console.error('Error parsing contact data:', error);
            if (contactNameElement) contactNameElement.textContent = number || '';
            if (companyNameElement) companyNameElement.textContent = '';
        }
    } else if (number) {
        if (contactNameElement) contactNameElement.textContent = number;
        if (companyNameElement) companyNameElement.textContent = '';
    }

    // ---- DOM refs used by the call flow ----
    const statusEl = document.querySelector('.call-status');
    const endCallButton = document.querySelector('.end-call-button');
    const controlButtons = document.querySelectorAll('.control-button');
    const muteButton = [...controlButtons].find(b => b.querySelector('span')?.textContent === 'Mute');

    // ---- Back button (navigating away disconnects any in-flight call via destroy) ----
    const backButton = document.querySelector('.back-button');
    backButton.addEventListener('click', () => {
        window.location.href = '/index.html';
    });

    // ---- Search bar (UI only) ----
    const searchInput = document.querySelector('.search-input');
    const searchClearButton = document.querySelector('.search-clear-button');
    searchInput.addEventListener('input', () => {
        searchClearButton.style.display = searchInput.value ? 'flex' : 'none';
    });
    searchClearButton.addEventListener('click', () => {
        searchInput.value = '';
        searchClearButton.style.display = 'none';
    });

    // ---- Speaker / Keypad toggles (UI only — wiring these to the real Device is a follow-up) ----
    controlButtons.forEach(button => {
        const label = button.querySelector('span')?.textContent;
        if (label === 'Speaker') {
            button.addEventListener('click', () => {
                const icon = button.querySelector('i');
                icon.classList.toggle('fa-volume-mute');
                icon.classList.toggle('fa-volume-up');
            });
        } else if (label === 'Keypad') {
            button.addEventListener('click', () => {
                const keypadSection = document.querySelector('.keypad-section');
                keypadSection.style.display = keypadSection.style.display === 'none' ? 'block' : 'none';
            });
        }
    });

    document.querySelectorAll('.keypad-button').forEach(button => {
        button.addEventListener('click', () => {
            button.style.backgroundColor = 'var(--color-border)';
            setTimeout(() => {
                button.style.backgroundColor = 'var(--color-background-light)';
            }, 100);
        });
    });

    // ---- Short-circuit if we're missing the inputs needed to place a call ----
    if (!userGuid || !number) {
        statusEl.textContent = 'Missing call details';
        return;
    }

    // ---- Real call flow: Device is already registered app-wide (see index.html + VoiceBootstrap.js) ----
    // calling.html loads standalone (no index.html shell), so we need to bootstrap here too
    // if the Device hasn't been registered yet (e.g. page was opened directly).
    try {
        statusEl.textContent = 'Connecting...';

        // Event listeners for this call flow's UI
        window.deviceService.on('callAccepted', () => {
            statusEl.textContent = 'Connected';
        });
        window.deviceService.on('callEnded', () => {
            statusEl.textContent = 'Call ended';
            setTimeout(() => { window.location.href = '/index.html'; }, 800);
        });
        window.deviceService.on('callError', (err) => {
            console.error('[Calling] Call error:', err);
            statusEl.textContent = `Error: ${err?.message || 'Call failed'}`;
        });
        window.deviceService.on('error', (err) => {
            console.error('[Calling] Device error:', err);
            statusEl.textContent = `Device error: ${err?.message || 'unknown'}`;
        });

        // If Device isn't already registered (e.g. deep-linked to this page), register now.
        if (!window.deviceService.isReady) {
            const tokenRes = await fetch('/voice/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userGuid })
            });
            if (!tokenRes.ok) throw new Error(`Token request failed (${tokenRes.status})`);
            const { token } = await tokenRes.json();
            await window.deviceService.setup(token);
        }

        // Custom params ride alongside To into /voice/outgoing so webhook activity creation
        // can map CallSid → { userGuid, contactGuid }
        await window.deviceService.makeCall(number, { userGuid, contactGuid });
    } catch (err) {
        console.error('[Calling] Failed to place call:', err);
        statusEl.textContent = `Error: ${err.message}`;
        return;
    }

    // ---- Mute button drives the real call ----
    let isMuted = false;
    if (muteButton) {
        muteButton.addEventListener('click', () => {
            if (!window.deviceService.isCallActive()) return;
            isMuted = !isMuted;
            window.deviceService.setMuted(isMuted);
            const icon = muteButton.querySelector('i');
            icon.classList.toggle('fa-microphone', !isMuted);
            icon.classList.toggle('fa-microphone-slash', isMuted);
        });
    }

    // ---- End Call button disconnects the real call; navigation happens in callEnded handler ----
    endCallButton.addEventListener('click', async () => {
        try {
            await window.deviceService.endCall();
        } catch (err) {
            console.error('[Calling] Failed to end call:', err);
            window.location.href = '/index.html';
        }
    });
});
