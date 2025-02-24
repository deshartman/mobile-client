document.addEventListener('DOMContentLoaded', () => {
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
    endCallButton.addEventListener('click', () => {
        window.location.href = '/index.html';
    });

});
