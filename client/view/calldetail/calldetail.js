// Call detail placeholder. Fetches /activities/:userGuid/by-contact/:contactGuid,
// filters to type === 'Phone', renders datetime + duration per row. No click
// handlers in Phase 1.

(function () {
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

    function renderRow(activity) {
        const row = document.createElement('div');
        row.className = 'list-item';
        row.style.cursor = 'default';

        const iconWrap = document.createElement('div');
        iconWrap.className = 'list-item-icon';
        const icon = document.createElement('i');
        icon.className = 'fas fa-phone';
        iconWrap.appendChild(icon);

        const content = document.createElement('div');
        content.className = 'list-item-content';
        const wrapper = document.createElement('div');
        wrapper.className = 'content-wrapper';
        const titleRow = document.createElement('div');
        titleRow.className = 'title-row';
        const title = document.createElement('div');
        title.className = 'list-item-title';
        title.textContent = formatDateTime(activity.datetime);
        titleRow.appendChild(title);
        const subtitle = document.createElement('div');
        subtitle.className = 'list-item-subtitle';
        subtitle.textContent = activity.identityValue || '';
        wrapper.appendChild(titleRow);
        wrapper.appendChild(subtitle);
        content.appendChild(wrapper);

        const info = document.createElement('div');
        info.className = 'list-item-info';
        const duration = document.createElement('div');
        duration.className = 'list-item-duration';
        duration.textContent = formatDuration(activity.duration || 0);
        info.appendChild(duration);

        row.appendChild(iconWrap);
        row.appendChild(content);
        row.appendChild(info);
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
        const contactGuid = params.get('contactGuid');
        const userGuid = sessionStorage.getItem('userGuid') || sessionStorage.getItem('userGUID');

        const listEl = document.getElementById('call-list');

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
            const calls = (Array.isArray(activities) ? activities : []).filter(a => a.type === 'Phone');
            if (calls.length === 0) {
                listEl.innerHTML = '<div class="empty-state">No calls yet for this contact.</div>';
                return;
            }
            calls.forEach(a => listEl.appendChild(renderRow(a)));
        } catch (err) {
            console.error('[CallDetail] Failed to load calls:', err);
            listEl.innerHTML = '<div class="empty-state">Failed to load call details.</div>';
        }
    }

    document.addEventListener('DOMContentLoaded', load);
})();
