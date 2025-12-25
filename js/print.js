/**
 * BiomCYL Print Module
 * Contains print functionality for reports
 */

import { els, state } from './ui.js';

/**
 * Prepares the print header with current patient data and triggers print
 */
export function printReport() {
    // Populate print header with patient data
    if (els.printPatientName) {
        els.printPatientName.textContent = els.patientName.value || '--';
    }
    if (els.printPatientId) {
        els.printPatientId.textContent = els.patientId.value || '--';
    }
    if (els.printSelectedEye && els.printEyeContainer) {
        let eyeText = '--';
        els.printEyeContainer.classList.remove('eye-right', 'eye-left');
        if (state.selectedEye === 'right') {
            eyeText = 'OD (Right Eye)';
            els.printEyeContainer.classList.add('eye-right');
        } else if (state.selectedEye === 'left') {
            eyeText = 'OS (Left Eye)';
            els.printEyeContainer.classList.add('eye-left');
        }
        els.printSelectedEye.textContent = eyeText;
    }
    if (els.printDate) {
        const today = new Date();
        const dateStr = today.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
        els.printDate.textContent = dateStr;
    }

    // Trigger browser print dialog
    window.print();
}
