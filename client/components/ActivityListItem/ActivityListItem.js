// A list item represents a "person you can talk to" on the main screen:
// either a known contact (row.kind === 'contact') or an unknown identity
// (row.kind === 'unknown') — typically a phone number that has activities
// but hasn't been promoted to a contact yet.
class ActivityListItem {
    constructor(row) {
        this.row = row;
        this.element = null;
    }

    getDisplayName() {
        if (this.row.kind === 'contact') {
            return `${this.row.firstName || ''} ${this.row.lastName || ''}`.trim();
        }
        return `<span class="phone-number">${this.row.identityValue}</span>`;
    }

    getCompanyName() {
        return this.row.company || '';
    }

    getFallbackIconClass() {
        return this.row.kind === 'unknown' ? 'fas fa-phone' : 'fas fa-user';
    }

    formatDateTime(datetime) {
        if (!datetime) return '';
        const date = new Date(datetime);
        return date.toLocaleString('en-US', {
            hour: 'numeric',
            minute: 'numeric',
            hour12: true,
            month: 'short',
            day: 'numeric'
        });
    }

    handleInfoClick(event) {
        event.stopPropagation();
        const params = new URLSearchParams();
        if (this.row.kind === 'contact') {
            params.set('guid', this.row.guid);
            params.set('firstName', this.row.firstName || '');
            params.set('lastName', this.row.lastName || '');
            params.set('identities', JSON.stringify(this.row.identities || []));
        } else {
            params.set('firstName', '');
            params.set('lastName', '');
            params.set('identities', JSON.stringify([
                { type: 'Phone', value: this.row.identityValue }
            ]));
        }
        window.location.href = `view/contact/contact.html?${params.toString()}`;
    }

    _storeContactForNavigation() {
        if (this.row.kind === 'contact') {
            const contact = {
                guid: this.row.guid,
                firstName: this.row.firstName,
                lastName: this.row.lastName,
                company: this.row.company,
                photoData: this.row.photoData,
                identities: this.row.identities || []
            };
            sessionStorage.setItem('currentContact', JSON.stringify(contact));
            sessionStorage.setItem('contactTimestamp', Date.now().toString());
        } else {
            sessionStorage.removeItem('currentContact');
            sessionStorage.removeItem('contactTimestamp');
        }
    }

    handleActionClick(event, action) {
        event.stopPropagation();

        if (action === 'settings') {
            this.handleInfoClick(event);
            return;
        }

        if (action === 'history') {
            this._storeContactForNavigation();
            const params = new URLSearchParams();
            if (this.row.kind === 'contact') {
                params.set('contactGuid', this.row.guid);
            } else if (this.row.identityValue) {
                params.set('identityValue', this.row.identityValue);
            }
            window.location.href = `view/history/history.html?${params.toString()}`;
            return;
        }

        // Resolve the identity value for call / message / whatsapp.
        let identityValue;
        if (this.row.kind === 'contact') {
            const match = (this.row.identities || []).find(id => id.type.toLowerCase() === action);
            identityValue = match ? match.value : (this.row.identities?.[0]?.value || '');
        } else {
            identityValue = this.row.identityValue;
        }

        this._storeContactForNavigation();

        switch (action) {
            case 'call':
                window.location.href = `view/calling/calling.html?number=${identityValue}`;
                break;
            case 'message':
                window.location.href = `view/message/message.html?number=${identityValue}`;
                break;
            case 'whatsapp':
                window.location.href = `view/whatsapp/whatsapp.html?number=${identityValue}`;
                break;
        }
    }

    handleItemClick(event) {
        document.querySelectorAll('.list-item-wrapper.expanded').forEach(el => {
            if (el !== this.element) {
                el.classList.remove('expanded');
            }
        });
        this.element.classList.toggle('expanded');
    }

    attachEventListeners() {
        const row = this.element.querySelector('.list-item');
        row.addEventListener('click', this.handleItemClick.bind(this));

        const actionButtons = this.element.querySelectorAll('.action-button');
        actionButtons.forEach(button => {
            button.addEventListener('click', (e) =>
                this.handleActionClick(e, button.dataset.action)
            );
        });
    }

    render() {
        const template = document.getElementById('activity-list-item');
        this.element = template.content.cloneNode(true).firstElementChild;

        // Left circle: photo if available, else kind-appropriate fallback icon.
        const iconType = this.element.querySelector('.icon-type');
        const iconWrap = this.element.querySelector('.list-item-icon');
        const photoData = this.row.photoData;
        if (photoData) {
            iconType.remove();
            const img = document.createElement('img');
            img.src = photoData;
            img.alt = '';
            img.className = 'list-item-photo';
            iconWrap.appendChild(img);
        } else {
            iconType.className = this.getFallbackIconClass();
        }

        const title = this.element.querySelector('.list-item-title');
        title.innerHTML = this.getDisplayName();

        const subtitle = this.element.querySelector('.list-item-subtitle');
        subtitle.textContent = this.getCompanyName() || ' ';

        const time = this.element.querySelector('.list-item-time');
        time.textContent = this.formatDateTime(this.row.lastInteractedAt);

        // No per-activity duration in the main-list view.
        const duration = this.element.querySelector('.list-item-duration');
        if (duration) duration.style.display = 'none';

        this.attachEventListeners();

        return this.element;
    }
}

export default ActivityListItem;
