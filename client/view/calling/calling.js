document.addEventListener('DOMContentLoaded', () => {
    let callSid = null;

    // Get contact data from sessionStorage
    const contactJson = sessionStorage.getItem('currentContact');
    const number = new URLSearchParams(window.location.search).get('number');

    // Initiate the call via the server (stub fires fake webhooks)
    (async () => {
        const userGuid = sessionStorage.getItem('userGUID');
        if (!userGuid || !number) return;
        let contactGuid = null;
        if (contactJson) {
            try { contactGuid = JSON.parse(contactJson).guid || null; } catch (e) { /* ignore */ }
        }
        try {
            const res = await fetch('/voice/call/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userGuid, to: number, contactGuid })
            });
            const data = await res.json();
            callSid = data.callSid;
            console.log('[Calling] Call started, callSid:', callSid);
        } catch (err) {
            console.error('[Calling] Failed to start call:', err);
        }
    })();

    if (contactJson) {
        try {
            const contact = JSON.parse(contactJson);

            // Update contact info in the DOM
            const contactNameElement = document.querySelector('.contact-name');
            const companyNameElement = document.querySelector('.company-name');

            if (contactNameElement) {
                contactNameElement.textContent =
                    `${contact.firstName} ${contact.lastName}`.trim();
            }

            if (companyNameElement) {
                companyNameElement.textContent = contact.company || '';
            }
        } catch (error) {
            console.error('Error parsing contact data:', error);
            // Fallback to showing the number
            if (number) {
                const contactNameElement = document.querySelector('.contact-name');
                if (contactNameElement) {
                    contactNameElement.textContent = number;
                }

                const companyNameElement = document.querySelector('.company-name');
                if (companyNameElement) {
                    companyNameElement.textContent = '';
                }
            }
        }
    } else if (number) {
        // If no contact data but we have a number, display the number
        const contactNameElement = document.querySelector('.contact-name');
        if (contactNameElement) {
            contactNameElement.textContent = number;
        }

        const companyNameElement = document.querySelector('.company-name');
        if (companyNameElement) {
            companyNameElement.textContent = '';
        }
    }

    // Back button functionality
    const backButton = document.querySelector('.back-button');
    backButton.addEventListener('click', () => {
        window.location.href = '/index.html';
    });

    // Search functionality
    const searchInput = document.querySelector('.search-input');
    const searchClearButton = document.querySelector('.search-clear-button');

    searchInput.addEventListener('input', () => {
        searchClearButton.style.display = searchInput.value ? 'flex' : 'none';
    });

    searchClearButton.addEventListener('click', () => {
        searchInput.value = '';
        searchClearButton.style.display = 'none';
    });

    // Call control buttons functionality
    const controlButtons = document.querySelectorAll('.control-button');
    controlButtons.forEach(button => {
        button.addEventListener('click', () => {
            const icon = button.querySelector('i');

            // Handle different button types
            const buttonType = button.querySelector('span').textContent;

            switch (buttonType) {
                case 'Speaker':
                    if (icon.classList.contains('fa-volume-mute')) {
                        icon.classList.remove('fa-volume-mute');
                        icon.classList.add('fa-volume-up');
                    } else {
                        icon.classList.remove('fa-volume-up');
                        icon.classList.add('fa-volume-mute');
                    }
                    break;

                case 'Keypad':
                    const keypadSection = document.querySelector('.keypad-section');
                    keypadSection.style.display = keypadSection.style.display === 'none' ? 'block' : 'none';
                    break;

                case 'Mute':
                    if (icon.classList.contains('fa-microphone')) {
                        icon.classList.remove('fa-microphone');
                        icon.classList.add('fa-microphone-slash');
                    } else {
                        icon.classList.remove('fa-microphone-slash');
                        icon.classList.add('fa-microphone');
                    }
                    break;
            }
        });
    });

    // Keypad button functionality
    const keypadButtons = document.querySelectorAll('.keypad-button');
    keypadButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Flash button to show it was pressed
            button.style.backgroundColor = 'var(--color-border)';
            setTimeout(() => {
                button.style.backgroundColor = 'var(--color-background-light)';
            }, 100);
        });
    });

    // End call button
    const endCallButton = document.querySelector('.end-call-button');
    endCallButton.addEventListener('click', async () => {
        if (callSid) {
            try {
                await fetch('/voice/call/end', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ callSid })
                });
            } catch (err) {
                console.error('[Calling] Failed to end call:', err);
            }
        }
        window.location.href = '/index.html';
    });

});
