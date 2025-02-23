// Sample data for recent activity
const recentActivity = [
    {
        type: 'phone',
        name: '',
        number: '+1 (555) 444-3333',
        datetime: '2025-02-23T01:15:00',
        company: '',
        duration: 45
    },
    {
        type: 'phone',
        name: 'John Smith',
        number: '+1 (555) 123-4567',
        datetime: '2025-02-22T10:30:00',
        company: 'Acme Corp',
        duration: 65 // duration in minutes
    },
    {
        type: 'message',
        name: 'Alice Johnson',
        number: '+1 (555) 987-6543',
        datetime: '2025-02-22T09:15:00',
        company: '',
        duration: 18
    },
    {
        type: 'whatsapp',
        name: 'Bob Wilson',
        number: '+1 (555) 456-7890',
        datetime: '2025-02-22T08:45:00',
        company: 'Tech Solutions',
        duration: 125
    }
];

// Function to format duration in hours and minutes
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

// Function to format date and time
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

// Function to get icon class based on type
function getIconClass(type) {
    switch (type) {
        case 'phone':
            return 'fas fa-phone';
        case 'message':
            return 'fas fa-comment';
        case 'whatsapp':
            return 'fab fa-whatsapp';
        default:
            return 'fas fa-question';
    }
}

// Identity types enum
window.IdentityType = {
    Phone: 'Phone',
    Message: 'Message',
    WhatsApp: 'WhatsApp',
    SIP: 'SIP',
    Client: 'Client'
};

// Contact Map data structure using primary phone number as key
const contacts = new Map([
    ['+1 (555) 234-5678', {
        firstName: 'Emma',
        lastName: 'Thompson',
        identities: [
            { type: IdentityType.Phone, value: '+1 (555) 234-5678' },
            { type: IdentityType.WhatsApp, value: '+1 (555) 234-5678' }
        ]
    }],
    ['+1 (555) 345-6789', {
        firstName: 'Michael',
        lastName: 'Chen',
        identities: [
            { type: IdentityType.Phone, value: '+1 (555) 345-6789' },
            { type: IdentityType.Message, value: '+1 (555) 345-6789' }
        ]
    }],
    ['+1 (555) 123-4567', {
        firstName: 'John',
        lastName: 'Smith',
        identities: [
            { type: IdentityType.Phone, value: '+1 (555) 123-4567' },
            { type: IdentityType.Message, value: '+1 (555) 123-4567' },
            { type: IdentityType.WhatsApp, value: '+1 (555) 123-4567' }
        ]
    }]
]);

// Function to format name display
function formatNameDisplay(item) {
    // For recent activity items
    if ('type' in item) {
        if (!item.name) {
            return `<span class="phone-number">${item.number}</span>`;
        }
        const contact = window.getContact(item.number);
        if (contact) {
            return `${contact.firstName} ${contact.lastName}`;
        }
        return item.name;
    }

    // For contact items
    if ('firstName' in item) {
        return `${item.firstName} ${item.lastName}`;
    }

    return `<span class="phone-number">${item.identities[0].value}</span>`;
}

// Function to create a list item
function createListItem(item) {
    const template = document.getElementById('activity-list-item');
    const listItem = template.content.cloneNode(true).firstElementChild;

    // Set icon
    const iconType = listItem.querySelector('.icon-type');
    iconType.className = getIconClass(item.type);

    // Set title
    const title = listItem.querySelector('.list-item-title');
    title.innerHTML = formatNameDisplay(item);

    // Set subtitle (company)
    const subtitle = listItem.querySelector('.list-item-subtitle');
    subtitle.innerHTML = item.company || '&nbsp;';

    // Set time and duration
    const time = listItem.querySelector('.list-item-time');
    time.textContent = formatDateTime(item.datetime);

    const duration = listItem.querySelector('.list-item-duration');
    duration.textContent = formatDuration(item.duration);

    // Add click event for the entire list item
    listItem.addEventListener('click', (e) => {
        // Don't trigger if clicking on icon or info icon (they have their own handlers)
        if (!e.target.closest('.list-item-icon') && !e.target.closest('.list-item-info-icon')) {
            switch (item.type) {
                case 'phone':
                    window.location.href = 'calling.html';
                    break;
                case 'message':
                    window.location.href = 'message.html';
                    break;
                case 'whatsapp':
                    window.location.href = 'whatsapp.html';
                    break;
            }
        }
    });

    // Add click event for the info icon
    const infoIcon = listItem.querySelector('.list-item-info-icon');
    infoIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        handleInfoClick(item);
    });

    // Add dropdown toggle functionality
    const listItemIcon = listItem.querySelector('.list-item-icon');
    const dropdownMenu = listItem.querySelector('.dropdown-menu');

    listItemIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        // Close all other open dropdowns
        document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
            if (menu !== dropdownMenu) {
                menu.classList.remove('show');
            }
        });
        dropdownMenu.classList.toggle('show');
    });

    // Add click events for dropdown items
    const dropdownItems = listItem.querySelectorAll('.dropdown-item');
    dropdownItems.forEach(dropdownItem => {
        dropdownItem.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = dropdownItem.dataset.action;
            switch (action) {
                case 'call':
                    window.location.href = 'calling.html';
                    break;
                case 'message':
                    window.location.href = 'message.html';
                    break;
                case 'whatsapp':
                    window.location.href = 'whatsapp.html';
                    break;
            }
        });
    });

    return listItem;
}

// Function to create a contact list item
function createContactListItem(contact) {
    const template = document.getElementById('contact-list-item');
    const listItem = template.content.cloneNode(true).firstElementChild;

    // Set title
    const title = listItem.querySelector('.list-item-title');
    title.innerHTML = formatNameDisplay(contact);

    // Set subtitle
    const subtitle = listItem.querySelector('.list-item-subtitle');
    subtitle.innerHTML = '&nbsp;';

    // Set duration
    const duration = listItem.querySelector('.list-item-duration');
    duration.innerHTML = '&nbsp;';

    // Populate dropdown menu
    const dropdownMenuEl = listItem.querySelector('.dropdown-menu');
    dropdownMenuEl.innerHTML = contact.identities.map(id => `
        <div class="dropdown-item" data-action="${id.type.toLowerCase()}">
            <i class="${getIconClass(id.type.toLowerCase())}"></i>
            <span>${id.type}</span>
        </div>
    `).join('');

    // Add click event for the info icon
    const infoIcon = listItem.querySelector('.list-item-info-icon');
    infoIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        handleContactInfoClick(contact);
    });

    // Add dropdown toggle functionality
    const listItemIcon = listItem.querySelector('.list-item-icon');

    listItemIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        // Close all other open dropdowns
        document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
            if (menu !== dropdownMenuEl) {
                menu.classList.remove('show');
            }
        });
        dropdownMenuEl.classList.toggle('show');
    });

    // Add click events for dropdown items
    const dropdownItems = listItem.querySelectorAll('.dropdown-item');
    dropdownItems.forEach(dropdownItem => {
        dropdownItem.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = dropdownItem.dataset.action;
            const identity = contact.identities.find(id => id.type.toLowerCase() === action);
            if (identity) {
                switch (action) {
                    case 'phone':
                        window.location.href = `calling.html?number=${identity.value}`;
                        break;
                    case 'message':
                        window.location.href = `message.html?number=${identity.value}`;
                        break;
                    case 'whatsapp':
                        window.location.href = `whatsapp.html?number=${identity.value}`;
                        break;
                }
            }
        });
    });

    return listItem;
}

// Make contact management functions globally accessible
window.updateContact = function (firstName, lastName, identities) {
    // Use the first phone number as the primary key
    const primaryIdentity = identities.find(id => id.type === IdentityType.Phone);
    if (!primaryIdentity) {
        throw new Error('Contact must have at least one phone number');
    }

    const primaryNumber = primaryIdentity.value;
    const contact = {
        firstName,
        lastName,
        identities
    };

    contacts.set(primaryNumber, contact);

    // Update recent activity entries that match any of the contact's identities
    recentActivity.forEach(activity => {
        if (identities.some(id => id.value === activity.number)) {
            activity.name = `${firstName} ${lastName}`;
        }
    });

    // Refresh the list if we're on the main page
    const listContainer = document.querySelector('.list-container');
    if (listContainer) {
        const searchInput = document.querySelector('.search-input');
        if (searchInput && searchInput.value) {
            handleSearch(searchInput.value);
        } else {
            populateList(recentActivity);
        }
    }
};

window.getContact = function (number) {
    // First try direct lookup
    let contact = contacts.get(number);
    if (contact) return contact;

    // If not found, search through all contacts' identities
    for (const [_, contact] of contacts) {
        if (contact.identities.some(id => id.value === number)) {
            return contact;
        }
    }
    return null;
};

window.deleteContact = function (number) {
    contacts.delete(number);

    // Update recent activity entries
    recentActivity.forEach(activity => {
        if (activity.number === number) {
            activity.name = '';
        }
    });

    // Refresh the list if we're on the main page
    const listContainer = document.querySelector('.list-container');
    if (listContainer) {
        const searchInput = document.querySelector('.search-input');
        if (searchInput && searchInput.value) {
            handleSearch(searchInput.value);
        } else {
            populateList(recentActivity);
        }
    }
};

// Function to get all identities of a specific type for a contact
window.getContactIdentities = function (number, type) {
    const contact = window.getContact(number);
    if (!contact) return [];
    return contact.identities.filter(id => id.type === type);
};

// Function to handle search
function handleSearch(searchTerm) {
    const searchString = searchTerm.toLowerCase();

    // Filter recent activity
    const filteredRecent = recentActivity.filter(item =>
        (item.name && item.name.toLowerCase().includes(searchString)) ||
        item.number.includes(searchString)
    );

    // Filter contacts
    const filteredContacts = Array.from(contacts.values()).filter(contact =>
        `${contact.firstName} ${contact.lastName}`.toLowerCase().includes(searchString) ||
        contact.identities.some(id => id.value.includes(searchString))
    );

    // Populate list with both filtered results
    const listContainer = document.querySelector('.list-container');
    listContainer.innerHTML = '';

    // Add recent activity items
    filteredRecent.forEach(item => {
        listContainer.appendChild(createListItem(item));
    });

    // Add contacts if there's a search term
    if (searchTerm) {
        filteredContacts.forEach(contact => {
            listContainer.appendChild(createContactListItem(contact));
        });
    }
}

// Contact event handlers
function handleContactClick(contact) {
    handleContactInfoClick(contact);
}

function handleContactInfoClick(contact) {
    const params = new URLSearchParams();
    params.set('firstName', contact.firstName);
    params.set('lastName', contact.lastName);
    params.set('identities', JSON.stringify(contact.identities));
    window.location.href = `contact.html?${params.toString()}`;
}

function handleInfoClick(item) {
    const contact = window.getContact(item.number);
    if (contact) {
        handleContactInfoClick(contact);
    } else {
        const params = new URLSearchParams();
        params.set('firstName', '');
        params.set('lastName', '');
        params.set('identities', JSON.stringify([{ type: item.type.charAt(0).toUpperCase() + item.type.slice(1), value: item.number }]));
        window.location.href = `contact.html?${params.toString()}`;
    }
}

function handleAddClick() {
    window.location.href = 'contact.html';
}

// Function to populate the list
function populateList(items) {
    const listContainer = document.querySelector('.list-container');
    listContainer.innerHTML = '';
    items.forEach(item => {
        listContainer.appendChild(createListItem(item));
    });
}

// Set up event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Initialize the list with recent activity
    populateList(recentActivity);

    // Set up search input and clear button handlers
    const searchInput = document.querySelector('.search-input');
    const clearButton = document.querySelector('.search-clear-button');

    searchInput.addEventListener('input', (e) => {
        const value = e.target.value;
        handleSearch(value);
        clearButton.style.display = value ? 'flex' : 'none';
    });

    clearButton.addEventListener('click', () => {
        searchInput.value = '';
        clearButton.style.display = 'none';
        populateList(recentActivity);
    });

    // Set up add button handler
    const addButton = document.querySelector('.add-button');
    addButton.addEventListener('click', handleAddClick);
});
