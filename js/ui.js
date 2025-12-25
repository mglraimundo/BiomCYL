/**
 * BiomCYL UI Module
 * Contains state management, DOM cache, and UI functions
 */

// ==========================================
// STATE VARIABLES
// ==========================================
export const state = {
    isMeasuredVisible: false,
    selectedEye: null,
    cachedBiomData: null,
    isLoadingBiomPin: false,
    activeTab: 'fileupload',
    selectedFile: null,
    isUploadingFile: false,
    currentBiomPin: null
};

// ==========================================
// DOM ELEMENTS CACHE
// ==========================================
export const els = {
    // Anterior Keratometry Inputs
    kFlat: document.getElementById('kFlat'),
    kSteep: document.getElementById('kSteep'),
    axisFlat: document.getElementById('axisFlat'),
    axisSteep: document.getElementById('axisSteep'),

    // Posterior Keratometry Inputs
    pkFlat: document.getElementById('pkFlat'),
    pkSteep: document.getElementById('pkSteep'),
    pAxisFlat: document.getElementById('pAxisFlat'),
    pAxisSteep: document.getElementById('pAxisSteep'),

    // Anterior Output Display
    dispK1: document.getElementById('dispK1'),
    dispK1Axis: document.getElementById('dispK1Axis'),
    dispK2: document.getElementById('dispK2'),
    dispK2Axis: document.getElementById('dispK2Axis'),
    resMeasMag: document.getElementById('resMeasMag'),
    resMeasAxis: document.getElementById('resMeasAxis'),

    // AK Regression Output
    resAkMag: document.getElementById('resAkMag'),
    resAkAxis: document.getElementById('resAkAxis'),

    // SO (Savini Optimized) Output
    resSoMag: document.getElementById('resSoMag'),
    resSoAxis: document.getElementById('resSoAxis'),

    // Posterior Output Display
    pkValuesRow: document.getElementById('pkValuesRow'),
    dispPk1: document.getElementById('dispPk1'),
    dispPk1Axis: document.getElementById('dispPk1Axis'),
    dispPk2: document.getElementById('dispPk2'),
    dispPk2Axis: document.getElementById('dispPk2Axis'),

    // Total Keratometry Output
    tkValuesRow: document.getElementById('tkValuesRow'),
    resTk1: document.getElementById('resTk1'),
    resTk1Axis: document.getElementById('resTk1Axis'),
    resTk2: document.getElementById('resTk2'),
    resTk2Axis: document.getElementById('resTk2Axis'),
    deltaTkLabel: document.getElementById('deltaTkLabel'),
    resTkNetMag: document.getElementById('resTkNetMag'),
    resTkNetAxis: document.getElementById('resTkNetAxis'),
    deltaTkSpacer: document.getElementById('deltaTkSpacer'),
    deltaTkLegend: document.getElementById('deltaTkLegend'),

    // UI Elements
    posteriorInputs: document.getElementById('posteriorInputs'),
    addMeasuredContainer: document.getElementById('addMeasuredContainer'),
    axisTypeBadge: document.getElementById('axisTypeBadge'),
    analysisSection: document.getElementById('analysisSection'),
    analysisHr: document.getElementById('analysisHr'),

    // Patient Data Elements
    patientName: document.getElementById('patientName'),
    patientId: document.getElementById('patientId'),
    eyeRight: document.getElementById('eyeRight'),
    eyeLeft: document.getElementById('eyeLeft'),

    // BiomPIN Elements
    biomPinInput: document.getElementById('biomPinInput'),
    loadBiomPinBtn: document.getElementById('loadBiomPinBtn'),
    loadBtnText: document.getElementById('loadBtnText'),
    loadBtnSpinner: document.getElementById('loadBtnSpinner'),
    biomPinMessage: document.getElementById('biomPinMessage'),

    // Tab elements
    tabBiomPin: document.getElementById('tabBiomPin'),
    tabFileUpload: document.getElementById('tabFileUpload'),
    panelBiomPin: document.getElementById('panelBiomPin'),
    panelFileUpload: document.getElementById('panelFileUpload'),

    // File upload elements
    biometryFileInput: document.getElementById('biometryFileInput'),
    filePickerLabel: document.getElementById('filePickerLabel'),
    filePickerBox: document.getElementById('filePickerBox'),
    filePickerSpinner: document.getElementById('filePickerSpinner'),
    filePickerText: document.getElementById('filePickerText'),
    fileNameDisplay: document.getElementById('fileNameDisplay'),

    // BiomAPI link elements
    biomApiLinkContainer: document.getElementById('biomApiLinkContainer'),
    biomApiLink: document.getElementById('biomApiLink'),

    // Print Elements
    printHeader: document.getElementById('printHeader'),
    printPatientName: document.getElementById('printPatientName'),
    printPatientId: document.getElementById('printPatientId'),
    printSelectedEye: document.getElementById('printSelectedEye'),
    printEyeContainer: document.getElementById('printEyeContainer'),
    printDate: document.getElementById('printDate'),
    printButtonContainer: document.getElementById('printButtonContainer')
};

// ==========================================
// UI LOGIC FUNCTIONS
// ==========================================

// Import calculate from calculations.js - circular dependency handled by ES6 modules
import { calculate } from './calculations.js';

export function toggleMeasured() {
    state.isMeasuredVisible = true;
    els.posteriorInputs.classList.remove('hidden');
    els.addMeasuredContainer.classList.add('hidden');
    calculate();
}

export function resetAndHidePK() {
    state.isMeasuredVisible = false;
    els.pkFlat.value = "";
    els.pkSteep.value = "";
    els.pAxisFlat.value = "";
    els.pAxisSteep.value = "";

    els.posteriorInputs.classList.add('hidden');
    els.addMeasuredContainer.classList.remove('hidden');

    // Hide TK and PK display rows
    els.tkValuesRow.classList.add('hidden');
    els.pkValuesRow.classList.add('hidden');
    // Hide delta TK grid elements
    els.deltaTkLabel.classList.add('hidden');
    els.resTkNetMag.classList.add('hidden');
    els.resTkNetAxis.classList.add('hidden');
    els.deltaTkSpacer.classList.add('hidden');
    els.deltaTkLegend.classList.add('hidden');

    calculate();
}

// Note: selectEye calls populateEyeData from biompin.js
// This will be wired up in main.js to avoid circular dependencies
let populateEyeDataCallback = null;

export function setPopulateEyeDataCallback(callback) {
    populateEyeDataCallback = callback;
}

export function selectEye(eye) {
    state.selectedEye = eye;

    if (eye === 'right') {
        els.eyeRight.classList.add('eye-selected');
        els.eyeLeft.classList.remove('eye-selected');
    } else {
        els.eyeLeft.classList.add('eye-selected');
        els.eyeRight.classList.remove('eye-selected');
    }

    // Populate form with cached data if available
    if (state.cachedBiomData && populateEyeDataCallback) {
        populateEyeDataCallback(eye);
    }
}

// ==========================================
// TAB & FILE UPLOAD FUNCTIONS
// ==========================================

/**
 * Switches between BiomPIN and File Upload tabs
 * @param {string} tab - 'biompin' or 'fileupload'
 */
export function switchTab(tab) {
    if (state.isLoadingBiomPin || state.isUploadingFile) return; // Prevent switching during loading

    state.activeTab = tab;

    if (tab === 'biompin') {
        els.panelBiomPin?.classList.remove('hidden');
        els.panelFileUpload?.classList.add('hidden');

        els.tabBiomPin?.classList.add('bg-blue-600', 'text-white');
        els.tabBiomPin?.classList.remove('bg-white', 'text-gray-600', 'border-2', 'border-gray-200');
        els.tabBiomPin?.setAttribute('aria-selected', 'true');

        els.tabFileUpload?.classList.remove('bg-blue-600', 'text-white');
        els.tabFileUpload?.classList.add('bg-white', 'text-gray-600', 'border-2', 'border-gray-200');
        els.tabFileUpload?.setAttribute('aria-selected', 'false');
    } else {
        els.panelFileUpload?.classList.remove('hidden');
        els.panelBiomPin?.classList.add('hidden');

        els.tabFileUpload?.classList.add('bg-blue-600', 'text-white');
        els.tabFileUpload?.classList.remove('bg-white', 'text-gray-600', 'border-2', 'border-gray-200');
        els.tabFileUpload?.setAttribute('aria-selected', 'true');

        els.tabBiomPin?.classList.remove('bg-blue-600', 'text-white');
        els.tabBiomPin?.classList.add('bg-white', 'text-gray-600', 'border-2', 'border-gray-200');
        els.tabBiomPin?.setAttribute('aria-selected', 'false');
    }
}

/**
 * Toggles loading state for file upload UI
 * @param {boolean} loading - Whether loading is in progress
 */
export function setFileUploadLoadingState(loading) {
    state.isUploadingFile = loading;

    if (loading) {
        // Show spinner, hide text
        els.filePickerSpinner?.classList.remove('hidden');
        els.filePickerText?.classList.add('hidden');
        els.fileNameDisplay?.classList.add('hidden');
        // Grey out and disable file picker
        els.filePickerBox?.classList.add('opacity-50', 'pointer-events-none');
        els.filePickerLabel?.classList.remove('cursor-pointer');
        els.filePickerLabel?.classList.add('cursor-not-allowed');
        els.biometryFileInput.disabled = true;
        els.tabBiomPin.disabled = true;
        els.tabFileUpload.disabled = true;
    } else {
        // Hide spinner, show default text
        els.filePickerSpinner?.classList.add('hidden');
        els.filePickerText?.classList.remove('hidden');
        els.fileNameDisplay?.classList.add('hidden');
        // Restore file picker styling
        els.filePickerBox?.classList.remove('opacity-50', 'pointer-events-none');
        els.filePickerLabel?.classList.add('cursor-pointer');
        els.filePickerLabel?.classList.remove('cursor-not-allowed');
        els.biometryFileInput.disabled = false;
        els.tabBiomPin.disabled = false;
        els.tabFileUpload.disabled = false;
        // Clear the selected file and reset input
        state.selectedFile = null;
        els.biometryFileInput.value = '';
    }
}
