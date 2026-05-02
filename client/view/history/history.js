// Per-contact history view: lists every activity for a single contact.
// Plain script (no modules). Reads contactGuid from the URL, userGuid from
// sessionStorage, fetches /activities/:userGuid/by-contact/:contactGuid and
// renders one row per activity. Click routing per type is documented inline.

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
        if (minutes < 60) {
            return `${minutes} mins`;
        }
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        if (remainingMinutes === 0) {
            return `${hours} hour${hours > 1 ? 's' : ''}`;
        }
        return `${hours} hour${hours > 1 ? 's' : ''} ${remainingMinutes} mins`;
    }

    function getDisplayName(activity) {
        if (activity.contact) {
            return `${activity.contact.firstName || ''} ${activity.contact.lastName || ''}`.trim()
                || activity.identityValue
                || '';
        }
        return activity.identityValue || '';
    }

    function handleRowClick(activity, contactGuid) {
        const identityValue = activity.identityValue || '';
        switch (activity.type) {
            case 'Phone':
            case 'SIP':
            case 'Client':
                window.location.href = `/view/calldetail/calldetail.html?contactGuid=${encodeURIComponent(contactGuid)}`;
                break;
            case 'Message':
                window.location.href = `/view/message/message.html?number=${encodeURIComponent(identityValue)}`;
                break;
            case 'WhatsApp':
                window.location.href = `/view/whatsapp/whatsapp.html?number=${encodeURIComponent(identityValue)}`;
                break;
            case 'Contact':
            default:
                // No navigation for contact-added audit rows.
                break;
        }
    }

    function renderRow(activity, contactGuid) {
        const row = document.createElement('div');
        row.className = 'list-item';
        if (activity.type === 'Contact') {
            row.style.cursor = 'default';
        }

        const iconWrap = document.createElement('div');
        iconWrap.className = 'list-item-icon';
        const icon = document.createElement('i');
        icon.className = getIconClass(activity.type);
        iconWrap.appendChild(icon);

        const content = document.createElement('div');
        content.className = 'list-item-content';
        const wrapper = document.createElement('div');
        wrapper.className = 'content-wrapper';
        const titleRow = document.createElement('div');
        titleRow.className = 'title-row';
        const title = document.createElement('div');
        title.className = 'list-item-title';
        title.textContent = getDisplayName(activity);
        titleRow.appendChild(title);
        const subtitle = document.createElement('div');
        subtitle.className = 'list-item-subtitle';
        subtitle.textContent = activity.type;
        wrapper.appendChild(titleRow);
        wrapper.appendChild(subtitle);
        content.appendChild(wrapper);

        const info = document.createElement('div');
        info.className = 'list-item-info';
        const time = document.createElement('div');
        time.className = 'list-item-time';
        time.textContent = formatDateTime(activity.datetime);
        info.appendChild(time);
        if (activity.type === 'Phone' || activity.type === 'SIP' || activity.type === 'Client') {
            const duration = document.createElement('div');
            duration.className = 'list-item-duration';
            duration.textContent = formatDuration(activity.duration || 0);
            info.appendChild(duration);
        }

        row.appendChild(iconWrap);
        row.appendChild(content);
        row.appendChild(info);

        row.addEventListener('click', () => handleRowClick(activity, contactGuid));
        return row;
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
            // ignore — fall back to default "History" title
        }
    }

    async function load() {
        setContactNameFromSession();

        const backBtn = document.getElementById('back-button');
        backBtn.addEventListener('click', () => {
            window.location.href = '/index.html';
        });

        const params = new URLSearchParams(window.location.search);
        const contactGuid = params.get('contactGuid');
        const userGuid = sessionStorage.getItem('userGuid') || sessionStorage.getItem('userGUID');

        const listEl = document.getElementById('history-list');

        if (!contactGuid || !userGuid) {
            listEl.innerHTML = '<div class="empty-state">Missing contact or user context.</div>';
            return;
        }

        try {
            const resp = await fetch(`/activities/${encodeURIComponent(userGuid)}/by-contact/${encodeURIComponent(contactGuid)}`);
            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }
            const activities = await resp.json();
            if (!Array.isArray(activities) || activities.length === 0) {
                listEl.innerHTML = '<div class="empty-state">No activity yet for this contact.</div>';
                return;
            }
            activities.forEach(a => listEl.appendChild(renderRow(a, contactGuid)));
        } catch (err) {
            console.error('[History] Failed to load activities:', err);
            listEl.innerHTML = '<div class="empty-state">Failed to load history.</div>';
        }
    }

    document.addEventListener('DOMContentLoaded', load);
})();
