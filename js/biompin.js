/**
 * BiomCYL BiomPIN Module
 * Contains BiomPIN API integration, file upload, and data population
 */

import { els, state, toggleMeasured, resetAndHidePK, selectEye, switchTab, setFileUploadLoadingState } from './ui.js';
import { calculate, clearResults, updateBadge, IDX_SIMK } from './calculations.js';

// ==========================================
// BIOMPIN FUNCTIONS
// ==========================================

/**
 * Extracts BiomPIN from user input (handles raw PIN or full URLs)
 * @param {string} input - Raw user input
 * @returns {string|null} - Extracted PIN or null if invalid
 */
export function extractBiomPIN(input) {
    if (!input || typeof input !== 'string') return null;

    const trimmed = input.trim();
    const pinRegex = /([a-z]+-[a-z]+-\d{6})/i;
    const match = trimmed.match(pinRegex);

    return match ? match[1].toLowerCase() : null;
}

/**
 * Toggles loading state for BiomPIN UI
 * @param {boolean} loading - Whether loading is in progress
 */
export function setLoadingState(loading) {
    state.isLoadingBiomPin = loading;

    if (loading) {
        els.biomPinInput.disabled = true;
        els.loadBiomPinBtn.disabled = true;
        els.loadBtnText.classList.add('hidden');
        els.loadBtnSpinner.classList.remove('hidden');
    } else {
        els.biomPinInput.disabled = false;
        els.loadBiomPinBtn.disabled = false;
        els.loadBtnText.classList.remove('hidden');
        els.loadBtnSpinner.classList.add('hidden');
    }
}

/**
 * Displays success or error message
 * @param {string} message - Message text
 * @param {string} type - 'success', 'error', or 'info'
 */
export function showBiomPinMessage(message, type = 'info') {
    const messageEl = els.biomPinMessage;
    messageEl.textContent = message;
    messageEl.classList.remove('hidden');

    messageEl.classList.remove('bg-green-100', 'text-green-700', 'bg-red-100', 'text-red-700', 'bg-blue-100', 'text-blue-700');

    if (type === 'success') {
        messageEl.classList.add('bg-green-100', 'text-green-700');
        setTimeout(() => messageEl.classList.add('hidden'), 2500);
    } else if (type === 'error') {
        messageEl.classList.add('bg-red-100', 'text-red-700');
    } else {
        messageEl.classList.add('bg-blue-100', 'text-blue-700');
    }
}

/**
 * Clears all form inputs
 */
export function clearFormData() {
    els.patientName.value = '';
    els.patientId.value = '';
    els.kFlat.value = '';
    els.kSteep.value = '';
    els.axisFlat.value = '';
    els.axisSteep.value = '';
    els.pkFlat.value = '';
    els.pkSteep.value = '';
    els.pAxisFlat.value = '';
    els.pAxisSteep.value = '';

    state.selectedEye = null;
    els.eyeRight.classList.remove('eye-selected');
    els.eyeLeft.classList.remove('eye-selected');

    clearResults();
}

/**
 * Populates form with keratometry data for specific eye from cache
 * @param {string} eye - 'right' or 'left'
 */
export function populateEyeData(eye) {
    if (!state.cachedBiomData) return;

    const eyeKey = eye + '_eye';
    const eyeData = state.cachedBiomData[eyeKey];

    if (!eyeData) return;

    // Populate anterior keratometry only if keratometric index matches 1.3375
    if (eyeData.keratometric_index === IDX_SIMK) {
        els.kFlat.value = eyeData.K1_magnitude ?? '';
        els.axisFlat.value = eyeData.K1_axis ?? '';
        els.kSteep.value = eyeData.K2_magnitude ?? '';
        els.axisSteep.value = eyeData.K2_axis ?? '';
    }

    // Populate posterior keratometry if available
    if (state.cachedBiomData.has_pk && state.cachedBiomData.pk_data) {
        const pkData = state.cachedBiomData.pk_data[eyeKey];
        if (pkData) {
            els.pkFlat.value = pkData.PK1_magnitude ?? '';
            els.pAxisFlat.value = pkData.PK1_axis ?? '';
            els.pkSteep.value = pkData.PK2_magnitude ?? '';
            els.pAxisSteep.value = pkData.PK2_axis ?? '';
        }
    }

    calculate();
}

/**
 * Updates and displays the BiomAPI link
 * @param {string} pin - The BiomPIN
 */
export function updateBiomApiLink(pin) {
    if (!pin || !els.biomApiLink || !els.biomApiLinkContainer) return;

    state.currentBiomPin = pin;
    els.biomApiLink.href = `https://biomapi.com/pin/${pin}`;
    els.biomApiLinkContainer.classList.remove('hidden');
}

/**
 * Updates the browser URL with BiomPIN for easy sharing
 * @param {string} pin - The BiomPIN to add to URL
 */
export function updateUrlWithPin(pin) {
    if (!pin) return;

    const url = new URL(window.location.href);
    url.searchParams.set('pin', pin);

    // Update URL without reloading the page
    window.history.replaceState({}, '', url.toString());
}

/**
 * Clears the BiomPIN from the browser URL
 */
export function clearUrlPin() {
    const url = new URL(window.location.href);

    // Only update if there's a pin parameter
    if (url.searchParams.has('pin')) {
        url.searchParams.delete('pin');

        // If no other params, remove the ? entirely
        const newUrl = url.searchParams.toString()
            ? url.pathname + '?' + url.searchParams.toString()
            : url.pathname;

        window.history.replaceState({}, '', newUrl);
    }
}

/**
 * Loads biometry data from BiomPIN API
 */
export async function loadBiomPIN() {
    if (state.isLoadingBiomPin) return;

    const inputValue = els.biomPinInput.value;
    const pin = extractBiomPIN(inputValue);

    if (!pin) {
        showBiomPinMessage('Invalid BiomPIN format. Expected: word-word-123456', 'error');
        return;
    }

    setLoadingState(true);

    try {
        const apiUrl = `https://biomapi.com/api/v1/biom/retrieve?biom_pin=${encodeURIComponent(pin)}`;

        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.message || 'API returned unsuccessful response');
        }

        if (!data.data?.patient || !data.data?.right_eye || !data.data?.left_eye) {
            throw new Error('Invalid response structure from API');
        }

        processBiomDataResponse(data, { source: 'biompin' });

        // Update BiomAPI link and URL
        state.currentBiomPin = pin;
        updateBiomApiLink(pin);
        updateUrlWithPin(pin);

    } catch (error) {
        console.error('BiomPIN load error:', error);
        showBiomPinMessage(`Error: ${error.message}`, 'error');
    } finally {
        setLoadingState(false);
    }
}

/**
 * Processes biometry data from BiomAPI (unified handler for both BiomPIN and file upload)
 * @param {Object} apiResponse - API response object
 * @param {Object} options - Processing options
 * @param {boolean} options.displayPin - Whether to display the BiomPIN (for file upload)
 * @param {string} options.source - Source of data: 'biompin' or 'upload'
 */
export function processBiomDataResponse(apiResponse, options = {}) {
    const { displayPin = false, source = 'biompin' } = options;
    const { data, extra_data } = apiResponse;

    // Extract BiomPIN if present (from BiomPIN load, update link)
    if (apiResponse.biom_pin && source === 'biompin') {
        state.currentBiomPin = apiResponse.biom_pin;
        updateBiomApiLink(apiResponse.biom_pin);
    }

    clearFormData();

    const hasPK = extra_data?.posterior_keratometry?.right_eye &&
                  extra_data?.posterior_keratometry?.left_eye;

    state.cachedBiomData = {
        patient: data.patient,
        right_eye: data.right_eye,
        left_eye: data.left_eye,
        has_pk: hasPK,
        pk_data: hasPK ? extra_data.posterior_keratometry : null
    };

    // Populate patient info
    if (data.patient.name) {
        els.patientName.value = data.patient.name;
    }
    if (data.patient.patient_id) {
        els.patientId.value = data.patient.patient_id;
    }

    // Show PK section if data exists
    if (hasPK && !state.isMeasuredVisible) {
        toggleMeasured();
    } else if (!hasPK && state.isMeasuredVisible) {
        resetAndHidePK();
    }

    // Default to right eye
    selectEye('right');
    populateEyeData('right');
}

/**
 * Handles file selection and validation
 * @param {Event} event - File input change event
 */
export function handleFileSelection(event) {
    const file = event.target.files[0];

    if (!file) {
        state.selectedFile = null;
        els.filePickerText?.classList.remove('hidden');
        els.fileNameDisplay?.classList.add('hidden');
        return;
    }

    // Validate file type
    const validExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.bmp'];
    const fileName = file.name.toLowerCase();
    const isValid = validExtensions.some(ext => fileName.endsWith(ext));

    if (!isValid) {
        showBiomPinMessage('Invalid file type. Please upload PDF or image (JPG, PNG, GIF, BMP).', 'error');
        state.selectedFile = null;
        return;
    }

    // Check file size (10MB limit)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
        showBiomPinMessage('File too large. Maximum size is 10MB.', 'error');
        state.selectedFile = null;
        return;
    }

    // Valid file selected - auto-trigger processing
    state.selectedFile = file;
    els.biomPinMessage?.classList.add('hidden');
    uploadBiometryFile();
}

/**
 * Uploads biometry file to BiomAPI and processes response
 */
export async function uploadBiometryFile() {
    if (!state.selectedFile || state.isUploadingFile) return;

    setFileUploadLoadingState(true);

    try {
        const formData = new FormData();
        formData.append('file', state.selectedFile);
        formData.append('biompin', 'true'); // Request BiomPIN generation

        const response = await fetch('https://biomapi.com/api/v1/biom/process', {
            method: 'POST',
            headers: {
                'Accept': 'application/json'
            },
            body: formData
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const apiResponse = await response.json();

        // Validate response structure
        if (!apiResponse.success) {
            throw new Error(apiResponse.message || 'API returned success: false');
        }

        if (!apiResponse.data || !apiResponse.data.patient || !apiResponse.data.right_eye || !apiResponse.data.left_eye) {
            throw new Error('Invalid response structure: missing required data fields');
        }

        // Process the response (populate form)
        processBiomDataResponse(apiResponse, { displayPin: true, source: 'upload' });

        // Store biomPin for after loading state is cleared
        const biomPin = apiResponse.metadata?.biompin?.pin;

        // Clear loading state before switching tabs (switchTab checks isUploadingFile)
        setFileUploadLoadingState(false);

        // Switch to BiomPIN tab and populate with generated pin
        if (biomPin) {
            state.currentBiomPin = biomPin;
            switchTab('biompin');
            if (els.biomPinInput) els.biomPinInput.value = biomPin;
            updateBiomApiLink(biomPin);
            updateUrlWithPin(biomPin);
        }

    } catch (error) {
        console.error('File upload error:', error);
        handleFileUploadError(error);
        setFileUploadLoadingState(false);
    }
}

/**
 * Handles file upload errors with user-friendly messages
 * @param {Error} error - The error object
 */
export function handleFileUploadError(error) {
    let message = 'Upload failed. Please try again.';

    if (error.message) {
        if (error.message.includes('HTTP 400')) {
            message = 'Invalid file format or corrupted file.';
        } else if (error.message.includes('HTTP 413')) {
            message = 'File too large. Please try a smaller file.';
        } else if (error.message.includes('HTTP 429')) {
            message = 'Rate limit exceeded. Please wait before uploading again.';
        } else if (error.message.includes('HTTP 422')) {
            message = 'Validation error. Please check your file format.';
        } else if (!error.message.includes('HTTP')) {
            message = error.message;
        }
    }

    showBiomPinMessage(message, 'error');
}

/**
 * Resets the entire form and clears all state
 */
export function resetForm() {
    // Clear BiomPIN cache and input
    state.cachedBiomData = null;
    if (els.biomPinInput) els.biomPinInput.value = '';
    if (els.biomPinMessage) els.biomPinMessage.classList.add('hidden');

    // Clear file upload state
    state.selectedFile = null;
    state.currentBiomPin = null;
    if (els.biometryFileInput) els.biometryFileInput.value = '';
    els.biomApiLinkContainer?.classList.add('hidden');
    els.filePickerText?.classList.remove('hidden');
    els.fileNameDisplay?.classList.add('hidden');

    // Clear form data
    clearFormData();
    resetAndHidePK();
    updateBadge(NaN);

    // Clear URL parameter
    clearUrlPin();

    // Switch to default upload tab
    switchTab('fileupload');
}

/**
 * Handles paste event on BiomPIN input to strip URLs and keep only the PIN
 * @param {ClipboardEvent} e - The paste event
 */
export function handleBiomPinPaste(e) {
    const pastedText = e.clipboardData?.getData('text');
    if (!pastedText) return;

    // Check if pasted text is a URL containing a BiomPIN
    const pin = extractBiomPIN(pastedText);
    if (pin && pastedText !== pin) {
        // It's a URL or different format, replace with just the PIN
        e.preventDefault();
        els.biomPinInput.value = pin;
    }
}

/**
 * Checks URL for BiomPIN parameter and auto-loads if present
 * Supports URL format: ?pin=word-word-123456
 */
export function checkUrlForBiomPin() {
    const urlParams = new URLSearchParams(window.location.search);
    const pin = urlParams.get('pin');

    if (pin) {
        // Switch to BiomPIN tab since it's no longer the default
        switchTab('biompin');
        // Populate the input field with the PIN from URL
        els.biomPinInput.value = pin;
        // Trigger the load function
        loadBiomPIN();
    }
}
