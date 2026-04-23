class ActivityListItem {
    constructor(activity) {
        this.activity = activity;
        this.element = null;
    }

    getIconClass() {
        switch (this.activity.type) {
            case 'Phone':
                return 'fas fa-phone';
            case 'Message':
                return 'fas fa-comment';
            case 'WhatsApp':
                return 'fab fa-whatsapp';
            case 'SIP':
                return 'fas fa-phone-alt';
            case 'Client':
                return 'fas fa-desktop';
            case 'Contact':
                return 'fas fa-user';
            default:
                return 'fas fa-question';
        }
    }

    getDisplayName() {
        if (this.activity.contact) {
            return `${this.activity.contact.firstName} ${this.activity.contact.lastName}`.trim();
        }
        return `<span class="phone-number">${this.activity.identityValue}</span>`;
    }

    getCompanyName() {
        return this.activity.contact?.company || '';
    }

    formatDateTime(datetime) {
        const date = new Date(datetime);
        return date.toLocaleString('en-US', {
            hour: 'numeric',
            minute: 'numeric',
            hour12: true,
            month: 'short',
            day: 'numeric'
        });
    }

    formatDuration(minutes) {
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

    handleInfoClick(event) {
        event.stopPropagation();
        if (this.activity.contact) {
            const params = new URLSearchParams();
            params.set('guid', this.activity.contact.guid);
            params.set('firstName', this.activity.contact.firstName);
            params.set('lastName', this.activity.contact.lastName);
            params.set('identities', JSON.stringify(this.activity.contact.identities));
            window.location.href = `view/contact/contact.html?${params.toString()}`;
        } else {
            const params = new URLSearchParams();
            params.set('firstName', '');
            params.set('lastName', '');
            params.set('identities', JSON.stringify([
                { type: this.activity.type, value: this.activity.identityValue }
            ]));
            window.location.href = `view/contact/contact.html?${params.toString()}`;
        }
    }

    handleActionClick(event, action) {
        event.stopPropagation();

        if (action === 'settings') {
            this.handleInfoClick(event);
            return;
        }

        const identity = this.activity.contact?.identities.find(id =>
            id.type.toLowerCase() === action
        ) || { value: this.activity.identityValue };

        // Store contact data in sessionStorage if available
        if (this.activity.contact) {
            sessionStorage.setItem('currentContact', JSON.stringify(this.activity.contact));
            sessionStorage.setItem('contactTimestamp', Date.now().toString());
        } else {
            // Clear any previous contact data
            sessionStorage.removeItem('currentContact');
            sessionStorage.removeItem('contactTimestamp');
        }

        switch (action) {
            case 'call':
                window.location.href = `view/calling/calling.html?number=${identity.value}`;
                break;
            case 'message':
                window.location.href = `view/message/message.html?number=${identity.value}`;
                break;
            case 'whatsapp':
                window.location.href = `view/whatsapp/whatsapp.html?number=${identity.value}`;
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
        // Row click toggles the drawer
        const row = this.element.querySelector('.list-item');
        row.addEventListener('click', this.handleItemClick.bind(this));

        // Action button clicks
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

        // Set icon
        const iconType = this.element.querySelector('.icon-type');
        iconType.className = this.getIconClass();

        // Set title (name or phone number)
        const title = this.element.querySelector('.list-item-title');
        title.innerHTML = this.getDisplayName();

        // Set subtitle (company)
        const subtitle = this.element.querySelector('.list-item-subtitle');
        subtitle.textContent = this.getCompanyName() || '\u00A0'; // Use non-breaking space if empty

        // Set time and duration
        const time = this.element.querySelector('.list-item-time');
        time.textContent = this.formatDateTime(this.activity.datetime);

        const duration = this.element.querySelector('.list-item-duration');
        // Only show duration for Phone, SIP, and Client type activities
        if (this.activity.type === 'Phone' || this.activity.type === 'SIP' || this.activity.type === 'Client') {
            duration.textContent = this.formatDuration(this.activity.duration);
        } else {
            duration.style.display = 'none';
        }

        this.attachEventListeners();

        return this.element;
    }
}

// Export the component
export default ActivityListItem;
