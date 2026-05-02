// Activity view — per-contact (or per-unknown-number) activity list.
// Plain script. Reads contactGuid OR identityValue from the URL; fetches
// /activities/:userGuid/by-contact/:contactGuid or /by-identity/:identityValue
// and renders the contact header + a compact row list.

(function () {
    const TYPE_TO_ICON = {
        Phone: 'fas fa-phone',
        Message: 'fas fa-comment',
        WhatsApp: 'fab fa-whatsapp',
        SIP: 'fas fa-phone-alt',
        Client: 'fas fa-desktop',
        Contact: 'fas fa-user'
    };

    function getIconClass(type) {
        return TYPE_TO_ICON[type] || 'fas fa-question';
    }

    function formatDateTime(datetime) {
        const date = new Date(datetime);
        return date.toLocaleString('en-US', {
            hour: 'numeric',
            minute: 'numeric',
            hour12: true,
            month: 'short',
            day: 'numeric'
        });
    }

    function formatDuration(minutes) {
        if (!minutes) return '';
        if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'}`;
        const hours = Math.floor(minutes / 60);
        const remaining = minutes % 60;
        if (remaining === 0) return `${hours} hr${hours === 1 ? '' : 's'}`;
        return `${hours} hr ${remaining} min`;
    }

    function initialsFor(firstName, lastName, fallback) {
        const a = (firstName || '').trim();
        const b = (lastName || '').trim();
        if (a || b) {
            return (a.slice(0, 1) + b.slice(0, 1)).toUpperCase() || '?';
        }
        // Unknown contact — use the first character of the identity value (likely "+").
        return (fallback || '?').trim().slice(0, 1) || '?';
    }

    function fillAvatar(el, contact, identityValue) {
        el.innerHTML = '';
        // Phase 2 will populate contact.photoData. Until then this is always null,
        // which is fine — initials fallback is the design.
        if (contact && contact.photoData) {
            const img = document.createElement('img');
            img.src = contact.photoData;
            img.alt = '';
            el.appendChild(img);
            return;
        }
        el.textContent = initialsFor(
            contact?.firstName,
            contact?.lastName,
            identityValue
        );
    }

    function getContactDisplayName(contact, identityValue) {
        if (!contact) return identityValue || 'Unknown';
        const full = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
        return full || identityValue || 'Unknown';
    }

    function getContactMeta(contact, identityValue) {
        // If there's a company we show it; otherwise fall back to the identity
        // value so unknown-number contacts still get a useful secondary line.
        if (contact) {
            const lines = [];
            if (contact.company) lines.push(contact.company);
            if (identityValue) lines.push(identityValue);
            return lines.join(' · ');
        }
        return identityValue || '';
    }

    function handleRowClick(activity, contactGuid, identityValue) {
        const value = activity.identityValue || identityValue || '';
        switch (activity.type) {
            case 'Phone':
            case 'SIP':
            case 'Client': {
                const qs = new URLSearchParams({ activityId: activity.id });
                if (contactGuid) qs.set('contactGuid', contactGuid);
                if (!contactGuid && identityValue) qs.set('identityValue', identityValue);
                window.location.href = `/view/calldetail/calldetail.html?${qs.toString()}`;
                break;
            }
            case 'Message':
                window.location.href = `/view/message/message.html?number=${encodeURIComponent(value)}`;
                break;
            case 'WhatsApp':
                window.location.href = `/view/whatsapp/whatsapp.html?number=${encodeURIComponent(value)}`;
                break;
            default:
                // Contact-added audit rows are inert.
                break;
        }
    }

    function renderRow(activity, contactGuid, identityValue) {
        const row = document.createElement('div');
        row.className = 'activity-row';
        if (activity.type === 'Contact') row.classList.add('is-inert');

        const icon = document.createElement('div');
        icon.className = 'channel-icon';
        const i = document.createElement('i');
        i.className = getIconClass(activity.type);
        icon.appendChild(i);

        const when = document.createElement('div');
        when.className = 'when';
        when.textContent = formatDateTime(activity.datetime);

        const duration = document.createElement('div');
        duration.className = 'duration';
        duration.textContent = formatDuration(activity.duration || 0);

        row.appendChild(icon);
        row.appendChild(when);
        row.appendChild(duration);

        if (activity.type !== 'Contact') {
            row.addEventListener('click', () => handleRowClick(activity, contactGuid, identityValue));
        }
        return row;
    }

    function wireEditButton(contactGuid, contact, identityValue) {
        const btn = document.getElementById('edit-button');
        btn.addEventListener('click', () => {
            // Preserve the "came from activity" trail so contact.html's back
            // button can route back here instead of the main screen.
            const params = new URLSearchParams();
            if (contact) {
                if (contact.guid) params.set('guid', contact.guid);
                params.set('firstName', contact.firstName || '');
                params.set('lastName', contact.lastName || '');
                if (contact.company) params.set('company', contact.company);
                params.set('identities', JSON.stringify(contact.identities || []));
            } else {
                // Unknown contact path — seed the form with a Phone identity.
                params.set('firstName', '');
                params.set('lastName', '');
                params.set('identities', JSON.stringify([
                    { type: 'Phone', value: identityValue || '' }
                ]));
            }
            params.set('from', 'activity');
            if (contactGuid) params.set('fromContactGuid', contactGuid);
            if (!contactGuid && identityValue) params.set('fromIdentityValue', identityValue);
            window.location.href = `/view/contact/contact.html?${params.toString()}`;
        });
    }

    async function load() {
        const params = new URLSearchParams(window.location.search);
        const contactGuid = params.get('contactGuid');
        const identityValue = params.get('identityValue');
        const userGuid = sessionStorage.getItem('userGuid') || sessionStorage.getItem('userGUID');

        const backBtn = document.getElementById('back-button');
        backBtn.addEventListener('click', () => {
            window.location.href = '/index.html';
        });

        const listEl = document.getElementById('history-list');
        const nameEl = document.getElementById('activity-name');
        const metaEl = document.getElementById('activity-meta');
        const avatarEl = document.getElementById('activity-avatar');

        if ((!contactGuid && !identityValue) || !userGuid) {
            listEl.innerHTML = '<div class="empty-state">Missing contact or user context.</div>';
            return;
        }

        // Seed the header from sessionStorage immediately so it doesn't flash
        // while we fetch. For unknown numbers this will be absent — we fall
        // back to the identityValue from the URL.
        let contact = null;
        try {
            const raw = sessionStorage.getItem('currentContact');
            if (raw) contact = JSON.parse(raw);
        } catch (_) { /* ignore */ }

        nameEl.textContent = getContactDisplayName(contact, identityValue);
        metaEl.textContent = getContactMeta(contact, identityValue);
        fillAvatar(avatarEl, contact, identityValue);
        wireEditButton(contactGuid, contact, identityValue);

        const url = contactGuid
            ? `/activities/${encodeURIComponent(userGuid)}/by-contact/${encodeURIComponent(contactGuid)}`
            : `/activities/${encodeURIComponent(userGuid)}/by-identity/${encodeURIComponent(identityValue)}`;

        try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const activities = await resp.json();
            if (!Array.isArray(activities) || activities.length === 0) {
                listEl.innerHTML = '<div class="empty-state">No activity yet for this contact.</div>';
                return;
            }
            // If the server gave us richer contact info than sessionStorage had,
            // upgrade the header.
            const firstWithContact = activities.find(a => a.contact);
            if (firstWithContact && !contact) {
                contact = firstWithContact.contact;
                nameEl.textContent = getContactDisplayName(contact, identityValue);
                metaEl.textContent = getContactMeta(contact, identityValue);
                fillAvatar(avatarEl, contact, identityValue);
                wireEditButton(contactGuid, contact, identityValue);
            }
            activities.forEach(a => listEl.appendChild(renderRow(a, contactGuid, identityValue)));
        } catch (err) {
            console.error('[Activity] Failed to load activities:', err);
            listEl.innerHTML = '<div class="empty-state">Failed to load activity.</div>';
        }
    }

    document.addEventListener('DOMContentLoaded', load);
})();
