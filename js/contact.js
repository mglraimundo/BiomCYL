/**
 * BiomCYL Contact Module
 * Contains contact modal functionality
 */

// DOM elements for contact modal (self-contained)
const contactModal = document.getElementById('contactModal');
const contactForm = document.getElementById('contactForm');
const contactFormStatus = document.getElementById('contactFormStatus');
const contactSubmitBtn = document.getElementById('contactSubmitBtn');
const contactBtnText = document.getElementById('contactBtnText');
const contactBtnSpinner = document.getElementById('contactBtnSpinner');

/**
 * Opens the contact modal
 */
export function openContactModal() {
    if (contactModal) {
        contactModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        document.getElementById('contactName')?.focus();
    }
}

/**
 * Closes the contact modal
 */
export function closeContactModal() {
    if (contactModal) {
        contactModal.classList.add('hidden');
        document.body.style.overflow = '';
        if (contactForm) contactForm.reset();
        if (contactFormStatus) {
            contactFormStatus.classList.add('hidden');
            contactFormStatus.innerHTML = '';
        }
    }
}

/**
 * Initializes the contact form with event listeners
 */
export function initContactForm() {
    if (contactForm) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            contactSubmitBtn.disabled = true;
            contactBtnText.classList.add('hidden');
            contactBtnSpinner.classList.remove('hidden');

            try {
                const formData = new FormData(contactForm);
                const response = await fetch('https://api.web3forms.com/submit', {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();

                if (data.success) {
                    contactFormStatus.textContent = 'Message sent successfully!';
                    contactFormStatus.classList.remove('hidden', 'bg-red-100', 'text-red-700');
                    contactFormStatus.classList.add('bg-green-100', 'text-green-700');
                    contactForm.reset();
                    setTimeout(closeContactModal, 2000);
                } else {
                    throw new Error(data.message || 'Failed to send message');
                }
            } catch (error) {
                contactFormStatus.textContent = 'Error: ' + error.message;
                contactFormStatus.classList.remove('hidden', 'bg-green-100', 'text-green-700');
                contactFormStatus.classList.add('bg-red-100', 'text-red-700');
            } finally {
                contactSubmitBtn.disabled = false;
                contactBtnText.classList.remove('hidden');
                contactBtnSpinner.classList.add('hidden');
            }
        });
    }

    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && contactModal && !contactModal.classList.contains('hidden')) {
            closeContactModal();
        }
    });
}
