// Call detail — single call view. Reads ?activityId + (contactGuid|identityValue)
// from the URL, fetches the contact's activities, finds the one matching the
// activity id, and shows its date/time at the top. Body is intentionally blank
// for now; transcription, actions, recordings will land here later.

(function () {
    function formatDateTime(datetime) {
        const date = new Date(datetime);
        return date.toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    }

    function setContactNameFromSession() {
        const nameEl = document.getElementById('contact-name');
        try {
            const raw = sessionStorage.getItem('currentContact');
            if (!raw) return;
            const c = JSON.parse(raw);
            const name = `${c.firstName || ''} ${c.lastName || ''}`.trim();
            if (name) nameEl.textContent = name;
        } catch (_) {
            // ignore
        }
    }

    async function load() {
        setContactNameFromSession();

        const backBtn = document.getElementById('back-button');
        backBtn.addEventListener('click', () => {
            window.history.back();
        });

        const params = new URLSearchParams(window.location.search);
        const activityId = params.get('activityId');
        const contactGuid = params.get('contactGuid');
        const identityValue = params.get('identityValue');
        const userGuid = sessionStorage.getItem('userGuid') || sessionStorage.getItem('userGUID');

        const datetimeEl = document.getElementById('call-datetime');

        if (!activityId || (!contactGuid && !identityValue) || !userGuid) {
            datetimeEl.textContent = '';
            return;
        }

        const url = contactGuid
            ? `/activities/${encodeURIComponent(userGuid)}/by-contact/${encodeURIComponent(contactGuid)}`
            : `/activities/${encodeURIComponent(userGuid)}/by-identity/${encodeURIComponent(identityValue)}`;

        try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const activities = await resp.json();
            const activity = Array.isArray(activities)
                ? activities.find(a => a.id === activityId)
                : null;
            if (!activity) {
                datetimeEl.textContent = '';
                return;
            }
            datetimeEl.textContent = formatDateTime(activity.datetime);

            // If the caller didn't pre-seed the header from sessionStorage
            // (unknown-number path), use the activity's enriched contact.
            const nameEl = document.getElementById('contact-name');
            if (nameEl.textContent === 'Call') {
                if (activity.contact) {
                    const full = `${activity.contact.firstName || ''} ${activity.contact.lastName || ''}`.trim();
                    if (full) nameEl.textContent = full;
                } else if (activity.identityValue) {
                    nameEl.textContent = activity.identityValue;
                }
            }
        } catch (err) {
            console.error('[CallDetail] Failed to load call:', err);
            datetimeEl.textContent = '';
        }
    }

    document.addEventListener('DOMContentLoaded', load);
})();
