/**
 * Registers the Twilio Device for the signed-in user and wires the
 * app-wide incoming-call modal (rendered in index.html).
 *
 * Called once per session after user validation. Because the SDK + DeviceService
 * are loaded in index.html, the Device outlives view changes — inbound calls
 * ring regardless of which screen the user is on.
 */

// Contacts are cached in-memory for fast caller-ID resolution on inbound calls.
let contactsCache = [];

// Match phone numbers by stripping everything except digits — handles formatting
// differences like "+61401277115" vs "+61 401 277 115" vs "(401) 277 115".
function normalizePhone(s) {
    return (s || '').replace(/\D/g, '');
}

function resolveContactName(phoneNumber) {
    const target = normalizePhone(phoneNumber);
    if (!target) return null;
    for (const contact of contactsCache) {
        for (const identity of contact.identities || []) {
            if (normalizePhone(identity.value) === target) {
                const name = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
                return name || null;
            }
        }
    }
    return null;
}

async function loadContacts(userGuid) {
    try {
        const res = await fetch(`/contacts/${userGuid}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        contactsCache = await res.json();
        console.log(`[VoiceBootstrap] Loaded ${contactsCache.length} contacts for caller-ID`);
    } catch (err) {
        console.error('[VoiceBootstrap] Failed to load contacts:', err);
        contactsCache = [];
    }
}

async function bootstrapVoice(userGuid) {
    if (!userGuid || !window.deviceService) return;

    // Avoid double-registering if bootstrap runs twice on the same session.
    if (window.deviceService.isReady) {
        console.log('[VoiceBootstrap] Device already registered');
        return;
    }

    // Load contacts in parallel with token fetch; don't block Device setup on it.
    loadContacts(userGuid);

    try {
        const res = await fetch('/voice/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userGuid })
        });
        if (!res.ok) throw new Error(`Token request failed (${res.status})`);
        const { token } = await res.json();

        await window.deviceService.setup(token);
        console.log('[VoiceBootstrap] Device registered for', userGuid);

        // Refresh token ~1 min before expiry so the Device stays registered.
        window.deviceService.on('tokenWillExpire', async () => {
            try {
                const r = await fetch('/voice/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userGuid })
                });
                const { token: fresh } = await r.json();
                await window.deviceService.updateToken(fresh);
                console.log('[VoiceBootstrap] Token refreshed');
            } catch (err) {
                console.error('[VoiceBootstrap] Token refresh failed:', err);
            }
        });
    } catch (err) {
        console.error('[VoiceBootstrap] Failed to register Device:', err);
    }

    wireIncomingCallModal();
}

function wireIncomingCallModal() {
    const modal = document.getElementById('incoming-call-modal');
    const fromEl = document.getElementById('incoming-call-from');
    const acceptBtn = document.getElementById('incoming-call-accept');
    const rejectBtn = document.getElementById('incoming-call-reject');
    if (!modal || !acceptBtn || !rejectBtn) return;

    const hide = () => { modal.style.display = 'none'; };
    const show = (from) => {
        if (fromEl) fromEl.textContent = from || 'Unknown';
        modal.style.display = 'flex';
    };

    window.deviceService.on('incomingCall', (call) => {
        const from = call?.parameters?.From || 'Unknown';
        const name = resolveContactName(from);
        const display = name || from;
        console.log('[VoiceBootstrap] Incoming call from', from, name ? `(resolved: ${name})` : '');
        show(display);
    });

    window.deviceService.on('callEnded', hide);
    window.deviceService.on('callRejected', hide);

    acceptBtn.addEventListener('click', async () => {
        hide();
        try {
            await window.deviceService.answerCall();
        } catch (err) {
            console.error('[VoiceBootstrap] Accept failed:', err);
        }
    });

    rejectBtn.addEventListener('click', async () => {
        hide();
        try {
            await window.deviceService.rejectCall();
        } catch (err) {
            console.error('[VoiceBootstrap] Reject failed:', err);
        }
    });
}

window.bootstrapVoice = bootstrapVoice;
