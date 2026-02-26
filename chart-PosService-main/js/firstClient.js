document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btn-first-client');
    const backdrop = document.getElementById('first-client-edit-backdrop');
    const closeBtn = document.getElementById('first-client-edit-close');
    const cancelBtn = document.getElementById('first-client-edit-cancel');
    const saveBtn = document.getElementById('first-client-edit-save');
    const numberInput = document.getElementById('first-client-number');
    const emailInput = document.getElementById('first-client-email');
    const statusEl = document.getElementById('first-client-edit-status');

    function openModal() {
        backdrop.classList.remove('hidden');
        backdrop.setAttribute('aria-hidden', 'false');
        backdrop.classList.add('open'); // Ensure 'open' class is added if CSS relies on it
    }

    function closeModal() {
        backdrop.classList.add('hidden');
        backdrop.setAttribute('aria-hidden', 'true');
        backdrop.classList.remove('open');
        statusEl.textContent = '';
    }

    if (btn) {
        btn.addEventListener('click', openModal);
    }

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const number = numberInput.value;
            const email = emailInput.value;

            console.log('Saving FirstClient:', { number, email });
            statusEl.textContent = 'Saved (check console)';

            // Here you would add the actual save logic
            setTimeout(closeModal, 1000);
        });
    }

    // Close on backdrop click
    if (backdrop) {
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                closeModal();
            }
        });
    }
});
