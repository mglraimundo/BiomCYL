/**
 * BiomCYL Main Entry Point
 * Wires up event listeners, initialization, and global exports
 */

// Import all modules
import { els, state, toggleMeasured, resetAndHidePK, selectEye, switchTab, setPopulateEyeDataCallback } from './ui.js';
import { calculate, syncAxis, normalizeDecimalInput } from './calculations.js';
import {
    loadBiomPIN,
    uploadBiometryFile,
    resetForm,
    populateEyeData,
    handleFileSelection,
    handleBiomPinPaste,
    checkUrlForBiomPin
} from './biompin.js';
import { printReport } from './print.js';
import { openContactModal, closeContactModal, initContactForm } from './contact.js';

// ==========================================
// WIRE UP CALLBACKS
// ==========================================
// Connect populateEyeData to selectEye (avoids circular dependency)
setPopulateEyeDataCallback(populateEyeData);

// ==========================================
// EVENT LISTENERS
// ==========================================

// Axis syncing and calculation on input
els.axisFlat.addEventListener('input', () => { syncAxis(els.axisFlat, els.axisSteep); calculate(); });
els.axisSteep.addEventListener('input', () => { syncAxis(els.axisSteep, els.axisFlat); calculate(); });
els.pAxisFlat.addEventListener('input', () => { syncAxis(els.pAxisFlat, els.pAxisSteep); calculate(); });
els.pAxisSteep.addEventListener('input', () => { syncAxis(els.pAxisSteep, els.pAxisFlat); calculate(); });

// Keratometry input handlers with decimal normalization
['kFlat', 'kSteep', 'pkFlat', 'pkSteep'].forEach(id => {
    const el = document.getElementById(id);
    if(el) {
        normalizeDecimalInput(el); // Add comma-to-period normalization
        el.addEventListener('input', calculate); // Existing handler
    }
});

// BiomPIN paste handler
if (els.biomPinInput) {
    els.biomPinInput.addEventListener('paste', handleBiomPinPaste);
}

// Tab switching event listeners
if (els.tabBiomPin) {
    els.tabBiomPin.addEventListener('click', () => switchTab('biompin'));
}
if (els.tabFileUpload) {
    els.tabFileUpload.addEventListener('click', () => switchTab('fileupload'));
}

// File upload event listener
if (els.biometryFileInput) {
    els.biometryFileInput.addEventListener('change', handleFileSelection);
}

// ==========================================
// INITIALIZATION
// ==========================================

// Initialize contact form
initContactForm();

// Run initial calculation
calculate();

// Check for BiomPIN in URL and auto-load
checkUrlForBiomPin();

// ==========================================
// GLOBAL EXPORTS
// (Required for onclick handlers in HTML)
// ==========================================
window.resetForm = resetForm;
window.toggleMeasured = toggleMeasured;
window.resetAndHidePK = resetAndHidePK;
window.selectEye = selectEye;
window.loadBiomPIN = loadBiomPIN;
window.printReport = printReport;
window.switchTab = switchTab;
window.uploadBiometryFile = uploadBiometryFile;
window.openContactModal = openContactModal;
window.closeContactModal = closeContactModal;
