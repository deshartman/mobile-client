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
        firstName: params.get('firstName') || '',
        lastName: params.get('lastName') || '',
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
    if (identity.type === 'Phone') {
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
function handleSubmit() {
    const firstName = document.getElementById('firstName').value;
    const lastName = document.getElementById('lastName').value;

    // Collect all identity values
    const identityInputs = document.querySelectorAll('.identity-input');
    const identities = Array.from(identityInputs)
        .map(input => ({
            type: input.dataset.type,
            value: input.value.trim()
        }))
        .filter(identity => identity.value !== ''); // Only include non-empty identities

    // Ensure there's at least one phone number
    if (!identities.some(id => id.type === 'Phone' && id.value)) {
        alert('At least one phone number is required');
        return;
    }

    // Update the contact
    window.updateContact(firstName, lastName, identities);
}

// Function to check if all required functions are available
function checkDependencies() {
    return window.IdentityType &&
        typeof window.updateContact === 'function' &&
        typeof window.getContact === 'function';
}

// Wait for dependencies to be available
function waitForDependencies(callback) {
    if (checkDependencies()) {
        callback();
    } else {
        setTimeout(() => waitForDependencies(callback), 50);
    }
}

// Set up event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Wait for script.js to initialize
    waitForDependencies(() => {
        try {
            // Populate form with existing data
            populateForm();

            // Set up event listeners after form is populated
            setupEventListeners();
        } catch (error) {
            console.error('Error initializing contact form:', error);
        }
    });
});

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

    // Create identity fields for each type
    const identitiesContainer = ensureElement('identitiesContainer');
    while (identitiesContainer.firstChild) {
        identitiesContainer.removeChild(identitiesContainer.firstChild);
    }

    // Create fields for all possible identity types
    const types = ['Phone', 'Message', 'WhatsApp', 'SIP', 'Client'];
    types.forEach(type => {
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
    backButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const firstName = document.getElementById('firstName').value;
        const lastName = document.getElementById('lastName').value;

        // Collect all identity values
        const identityInputs = document.querySelectorAll('.identity-input');
        const identities = Array.from(identityInputs)
            .map(input => ({
                type: input.dataset.type,
                value: input.value.trim()
            }))
            .filter(identity => identity.value !== '');

        // Ensure there's at least one phone number
        if (!identities.some(id => id.type === 'Phone' && id.value)) {
            alert('At least one phone number is required');
            return;
        }

        // Update the contact
        window.updateContact(firstName, lastName, identities);

        // Navigate to index.html
        window.location.href = 'index.html';
    });

    // Handle image upload
    const imageUpload = document.getElementById('imageUpload');
    imageUpload.addEventListener('change', handleImageUpload);

    // Handle form input changes
    const inputs = document.querySelectorAll('input[type="text"], input[type="tel"]');
    inputs.forEach(input => {
        input.addEventListener('change', handleSubmit);
    });
});
