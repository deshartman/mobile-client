// Identity types enum
const IdentityType = {
    Phone: 'Phone',
    Message: 'Message',
    WhatsApp: 'WhatsApp',
    SIP: 'SIP',
    Client: 'Client'
};

// Custom event for contact updates
const CONTACT_UPDATED_EVENT = 'contactUpdated';

// Track if form has been touched
let isFormTouched = false;

// Function to get URL parameters
function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    let identities;
    try {
        identities = JSON.parse(params.get('identities') || '[]');
    } catch (e) {
        console.error('Error parsing identities:', e);
        identities = [];
    }
    return {
        guid: params.get('guid') || '',
        firstName: params.get('firstName') || '',
        lastName: params.get('lastName') || '',
        company: params.get('company') || '',
        identities
    };
}

// Function to create an identity input field
function createIdentityField(identity) {
    const container = document.createElement('div');
    container.className = 'form-group';
    container.setAttribute('data-type', identity.type);

    const label = document.createElement('label');
    label.htmlFor = identity.type.toLowerCase();
    label.textContent = identity.type;
    container.appendChild(label);

    const input = document.createElement('input');
    input.type = 'text';
    input.id = identity.type.toLowerCase();
    input.className = 'identity-input';
    input.setAttribute('data-type', identity.type);
    input.value = identity.value || '';
    if (identity.type === IdentityType.Phone) {
        input.required = true;
    }
    container.appendChild(input);

    return container;
}

// Function to handle image upload
function handleImageUpload(event) {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const profileImage = document.getElementById('profileImage');
            const defaultIcon = document.querySelector('.default-icon');

            profileImage.src = e.target.result;
            profileImage.style.display = 'block';
            defaultIcon.style.display = 'none';
        };
        reader.readAsDataURL(file);
    }
}

// Function to handle form submission
async function handleSubmit() {
    const firstName = document.getElementById('firstName').value;
    const lastName = document.getElementById('lastName').value;
    const company = document.getElementById('companyName').value;

    // Collect all identity values
    const identityInputs = document.querySelectorAll('.identity-input');
    const identities = Array.from(identityInputs)
        .map(input => ({
            type: input.dataset.type,
            value: input.value.trim()
        }))
        .filter(identity => identity.value !== ''); // Only include non-empty identities

    // Only validate if form has been touched
    if (isFormTouched) {
        // Ensure there's at least one phone number
        if (!identities.some(id => id.type === IdentityType.Phone && id.value)) {
            showError('At least one phone number is required');
            return false;
        }
    }

    // If not touched, just return true to allow navigation
    if (!isFormTouched) {
        return true;
    }

    // Get the primary phone number (first phone number)
    const primaryPhone = identities.find(id => id.type === IdentityType.Phone).value;

    // Determine if this is a new contact or editing existing
    const existingGuid = getUrlParams().guid;
    const isNewContact = !existingGuid;
    
    // Create contact object
    const contact = {
        guid: existingGuid || `contact-${Date.now()}`,
        firstName,
        lastName,
        company,
        identities
    };

    try {
        // Get userGUID from sessionStorage
        const userGUID = sessionStorage.getItem('userGUID');
        if (!userGUID) {
            showError('User not logged in');
            return false;
        }

        console.log(`[Contact] ${isNewContact ? 'Creating new' : 'Updating existing'} contact:`, contact);

        // Choose appropriate HTTP method and endpoint
        const method = isNewContact ? 'POST' : 'PUT';
        const endpoint = isNewContact ? `/contacts/${userGUID}` : `/contacts/${userGUID}/${contact.guid}`;

        // Save contact to server
        const response = await fetch(endpoint, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(contact)
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        const savedContact = await response.json();
        console.log('[Contact] Contact saved to server:', savedContact);

        // Only create activity for NEW contacts, not edits
        if (isNewContact) {
            const newActivity = {
                type: 'Contact',
                datetime: new Date().toISOString(),
                duration: 0, // 0 duration indicates contact addition
                identityValue: primaryPhone,
                contactGuid: savedContact.guid
            };

            console.log('[Contact] Creating activity for new contact:', newActivity);

            // Send activity to server
            const activityResponse = await fetch(`/activities/${userGUID}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(newActivity)
            });

            if (activityResponse.ok) {
                const savedActivity = await activityResponse.json();
                console.log('[Contact] Activity created:', savedActivity);
            } else {
                console.warn('[Contact] Failed to create activity, but contact was saved');
            }
        } else {
            console.log('[Contact] Existing contact updated, no activity created');
        }

        // Also save to sessionStorage as backup/cache
        const contacts = JSON.parse(sessionStorage.getItem('contacts') || '{}');
        contacts[primaryPhone] = savedContact;
        sessionStorage.setItem('contacts', JSON.stringify(contacts));

        // Mark cache as stale so main page will refresh
        sessionStorage.removeItem('activitiesCacheTimestamp');
        
        console.log('[Contact] Contact saved successfully, cache invalidated');
        return true;

    } catch (error) {
        console.error('[Contact] Error saving contact:', error);
        showError('Failed to save contact. Please try again.');
        return false;
    }
}

// Function to show error banner
function showError(message) {
    const errorBanner = document.getElementById('errorBanner');
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = message;
    errorBanner.style.display = 'flex';
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        hideError();
    }, 5000);
}

// Function to hide error banner
function hideError() {
    const errorBanner = document.getElementById('errorBanner');
    errorBanner.style.display = 'none';
}

// Function to mark form as touched
function markFormAsTouched() {
    isFormTouched = true;
    hideError(); // Hide any existing errors when user starts editing
}

// Function to clear all form fields and reset touched state
function clearForm() {
    // Clear all form fields
    document.getElementById('firstName').value = '';
    document.getElementById('lastName').value = '';
    document.getElementById('companyName').value = '';
    
    // Clear all identity inputs
    const identityInputs = document.querySelectorAll('.identity-input');
    identityInputs.forEach(input => {
        input.value = '';
    });
    
    // Reset profile image
    const profileImage = document.getElementById('profileImage');
    const defaultIcon = document.querySelector('.default-icon');
    profileImage.style.display = 'none';
    defaultIcon.style.display = 'block';
    
    // Hide any error messages
    hideError();
    
    // Reset touched state
    isFormTouched = false;
}

// Function to ensure an element exists
function ensureElement(id) {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Element with id '${id}' not found`);
    }
    return element;
}

// Function to populate form fields
function populateForm() {
    const params = getUrlParams();

    // Set form values
    ensureElement('firstName').value = params.firstName;
    ensureElement('lastName').value = params.lastName;
    ensureElement('companyName').value = params.company;

    // Create identity fields for each type
    const identitiesContainer = ensureElement('identitiesContainer');
    while (identitiesContainer.firstChild) {
        identitiesContainer.removeChild(identitiesContainer.firstChild);
    }

    // Create fields for all possible identity types
    Object.values(IdentityType).forEach(type => {
        const identity = (params.identities || []).find(id =>
            id.type.toLowerCase() === type.toLowerCase()
        ) || { type, value: '' };
        const field = createIdentityField(identity);
        identitiesContainer.appendChild(field);
    });
}

// Function to set up all event listeners
function setupEventListeners() {
    // Handle back button with save
    const backButton = document.querySelector('.back-button');
    backButton.addEventListener('click', async (e) => {
        console.info('Back button clicked...');
        e.preventDefault();
        e.stopPropagation();
        
        // Show loading state
        backButton.disabled = true;
        backButton.textContent = 'Saving...';
        
        try {
            const success = await handleSubmit();
            if (success) {
                window.location.href = '/index.html';
            }
        } finally {
            // Reset button state
            backButton.disabled = false;
            backButton.innerHTML = '<i class="fas fa-chevron-left"></i>';
        }
    });

    // Handle clear button
    const clearButton = document.querySelector('.clear-button');
    clearButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        clearForm();
    });

    // Handle image upload (marks form as touched)
    const imageUpload = document.getElementById('imageUpload');
    imageUpload.addEventListener('change', (e) => {
        markFormAsTouched();
        handleImageUpload(e);
    });

    // Add touch tracking to all form inputs
    const formInputs = ['firstName', 'lastName', 'companyName'];
    formInputs.forEach(inputId => {
        const input = document.getElementById(inputId);
        if (input) {
            input.addEventListener('input', markFormAsTouched);
        }
    });

    // Add touch tracking to identity inputs (added dynamically)
    document.addEventListener('input', (e) => {
        if (e.target.classList.contains('identity-input')) {
            markFormAsTouched();
        }
    });
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    try {
        populateForm();
        setupEventListeners();
    } catch (error) {
        console.error('Error initializing contact form:', error);
    }
});
