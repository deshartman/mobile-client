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

// Human-facing labels. The underlying identity.type is still "Message" (SMS)
// so the server contract is unchanged.
const IDENTITY_LABELS = {
    Phone: 'Phone',
    Message: 'SMS',
    WhatsApp: 'WhatsApp',
    SIP: 'SIP',
    Client: 'Client'
};

// Function to create an identity input field.
// The Phone row additionally renders an "Also SMS" checkbox that, when ticked,
// keeps the Message row's value mirrored + readonly. The Message row itself is
// always rendered; its editability depends on the Phone row's checkbox state.
function createIdentityField(identity, options = {}) {
    const container = document.createElement('div');
    container.className = 'form-group';
    container.setAttribute('data-type', identity.type);

    const label = document.createElement('label');
    label.htmlFor = identity.type.toLowerCase();
    label.textContent = IDENTITY_LABELS[identity.type] || identity.type;
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

    if (identity.type === IdentityType.Phone) {
        // Phone input + "Also SMS" checkbox share a row.
        const row = document.createElement('div');
        row.className = 'phone-row';
        row.appendChild(input);

        const toggleLabel = document.createElement('label');
        toggleLabel.className = 'also-sms-toggle';
        const toggle = document.createElement('input');
        toggle.type = 'checkbox';
        toggle.id = 'alsoSmsToggle';
        toggle.checked = options.alsoSmsChecked !== false; // default on
        const toggleText = document.createElement('span');
        toggleText.textContent = 'SMS';
        toggleLabel.appendChild(toggle);
        toggleLabel.appendChild(toggleText);
        row.appendChild(toggleLabel);

        container.appendChild(row);
    } else {
        container.appendChild(input);
    }

    return container;
}

// Downscale the uploaded image to a 256px square JPEG. A phone camera photo
// can be several MB as a base64 data URL, which trips Express's default 100KB
// body limit AND bloats every /contacts response that carries it. 256px @ 0.85
// quality renders fine at 44px avatar size (even on retina) and typically
// comes out under 40KB.
const AVATAR_MAX_PX = 256;
const AVATAR_JPEG_QUALITY = 0.85;

async function downscaleImageToDataUrl(file) {
    const originalUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });

    const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error('Image decode failed'));
        i.src = originalUrl;
    });

    // Cover-crop to a square so the circular avatar never shows letterboxing.
    const side = Math.min(img.width, img.height);
    const sx = (img.width - side) / 2;
    const sy = (img.height - side) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_MAX_PX;
    canvas.height = AVATAR_MAX_PX;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_MAX_PX, AVATAR_MAX_PX);
    return canvas.toDataURL('image/jpeg', AVATAR_JPEG_QUALITY);
}

async function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file?.type.startsWith('image/')) return;

    try {
        const dataUrl = await downscaleImageToDataUrl(file);
        const profileImage = document.getElementById('profileImage');
        const defaultIcon = document.querySelector('.default-icon');
        profileImage.src = dataUrl;
        profileImage.style.display = 'block';
        defaultIcon.style.display = 'none';
    } catch (err) {
        console.error('[Contact] Image downscale failed:', err);
        showError('Could not process that image. Try another file.');
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
    
    // Pick up the uploaded photo (data URL). When the user hasn't uploaded
    // anything the <img> stays display:none with an empty src, so we treat
    // "no src / empty src" as "leave the existing photo alone" on edit.
    const profileImageEl = document.getElementById('profileImage');
    const photoData = profileImageEl && profileImageEl.style.display !== 'none' && profileImageEl.src
        ? profileImageEl.src
        : undefined;

    // Create contact object
    const contact = {
        guid: existingGuid || `contact-${Date.now()}`,
        firstName,
        lastName,
        company,
        identities
    };
    if (photoData !== undefined) contact.photoData = photoData;

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

    // Reset "Also SMS" to its default (ticked, SMS mirrors Phone = both empty).
    const toggle = document.getElementById('alsoSmsToggle');
    const smsInput = document.getElementById('message');
    if (toggle) toggle.checked = true;
    if (smsInput) smsInput.readOnly = true;
    
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

    // Compute initial "Also SMS" state: tick it when SMS is empty or matches
    // Phone — otherwise it's a distinct number, leave unticked so the user can
    // see/edit both values.
    const phoneVal = (params.identities || []).find(id => id.type === IdentityType.Phone)?.value || '';
    const smsVal = (params.identities || []).find(id => id.type === IdentityType.Message)?.value || '';
    const alsoSmsChecked = !smsVal || smsVal === phoneVal;

    // Create fields for all possible identity types
    Object.values(IdentityType).forEach(type => {
        const identity = (params.identities || []).find(id =>
            id.type.toLowerCase() === type.toLowerCase()
        ) || { type, value: '' };
        const field = createIdentityField(identity, { alsoSmsChecked });
        identitiesContainer.appendChild(field);
    });

    wireAlsoSmsToggle(alsoSmsChecked);

    // Seed the photo preview for existing contacts — URL params can't carry
    // data URLs, so we fetch the full contact.
    if (params.guid) {
        seedPhotoFromServer(params.guid).catch(err => {
            console.warn('[Contact] Could not load photo:', err.message);
        });
    }
}

// Keep the SMS input mirrored from Phone when the "Also SMS" checkbox is
// ticked. When unticked, SMS becomes a free-text field for a second number.
function wireAlsoSmsToggle(initialChecked) {
    const toggle = document.getElementById('alsoSmsToggle');
    const phoneInput = document.getElementById('phone');
    const smsInput = document.getElementById('message');
    if (!toggle || !phoneInput || !smsInput) return;

    const applyMirrorState = () => {
        if (toggle.checked) {
            smsInput.value = phoneInput.value;
            smsInput.readOnly = true;
        } else {
            smsInput.readOnly = false;
        }
    };

    // Apply initial state. When ticked, this seeds SMS from Phone — the
    // Message field was rendered with its stored value (often empty) and
    // needs to be mirrored now, not only on subsequent toggle changes.
    applyMirrorState();

    toggle.addEventListener('change', () => {
        markFormAsTouched();
        applyMirrorState();
    });

    phoneInput.addEventListener('input', () => {
        if (toggle.checked) smsInput.value = phoneInput.value;
    });
}

async function seedPhotoFromServer(contactGuid) {
    const userGUID = sessionStorage.getItem('userGUID');
    if (!userGUID) return;
    const resp = await fetch(`/contacts/${userGUID}/${contactGuid}`);
    if (!resp.ok) return;
    const contact = await resp.json();
    if (!contact || !contact.photoData) return;
    const profileImage = document.getElementById('profileImage');
    const defaultIcon = document.querySelector('.default-icon');
    if (profileImage) {
        profileImage.src = contact.photoData;
        profileImage.style.display = 'block';
    }
    if (defaultIcon) {
        defaultIcon.style.display = 'none';
    }
}

// Function to set up all event listeners
function setupEventListeners() {
    // Handle back button with save. If we were opened from the Activity view
    // (via ?from=activity) go back there; otherwise default to the main screen.
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
                const params = new URLSearchParams(window.location.search);
                if (params.get('from') === 'activity') {
                    const qs = new URLSearchParams();
                    const fromContactGuid = params.get('fromContactGuid');
                    const fromIdentityValue = params.get('fromIdentityValue');
                    if (fromContactGuid) qs.set('contactGuid', fromContactGuid);
                    else if (fromIdentityValue) qs.set('identityValue', fromIdentityValue);
                    window.location.href = `/view/history/history.html?${qs.toString()}`;
                    return;
                }
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
