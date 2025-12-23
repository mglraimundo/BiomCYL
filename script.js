(function() {
    'use strict';

    // ==========================================
    // CONSTANTS & CONFIGURATION
    // ==========================================
    const AK_INTERCEPT_X = 0.508;
    const AK_SLOPE_X = 0.926;
    const AK_INTERCEPT_Y = 0.009;
    const AK_SLOPE_Y = 0.932;

    // Savini Optimized Astigmatism (Placido) - Savini et al. JCRS 2017
    const SO_INTERCEPT = 0.103;
    const SO_SLOPE = 0.836;
    const SO_COS_COEFF = 0.457;

    const IDX_SIMK = 1.3375;
    const IDX_ANT = 1.376;

    // Liou-Brennan Scale Factor (1.02116)
    // Manually modified to match IOL700 printouts to 1.0205 as per prior instructions
    const MOD_LIOU_BRENNAN_SCALE_FACTOR = 1.0205;

    const CCT_DEFAULT = 540;

    // ==========================================
    // STATE VARIABLES
    // ==========================================
    let isMeasuredVisible = false;
    let selectedEye = null;

    // BiomPIN Data Cache
    let cachedBiomData = null; // Structure: { patient, right_eye, left_eye, has_pk, pk_data }
    let isLoadingBiomPin = false;

    // ==========================================
    // DOM ELEMENTS CACHE
    // ==========================================
    const els = {
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
    // UTILITY FUNCTIONS
    // ==========================================
    function toRadians(deg) {
        return deg * (Math.PI / 180);
    }

    function toDegrees(rad) {
        return rad * (180 / Math.PI);
    }

    function normalizeAxis(angle) {
        let a = angle % 180;
        if (a <= 0) a += 180;
        return a;
    }

    function syncAxis(source, target) {
        const val = parseFloat(source.value);
        if (isNaN(val)) return;
        let otherAxis = normalizeAxis(val + 90);
        target.value = otherAxis;
    }

    /**
     * Normalizes decimal input by converting comma to period for type="number" fields
     * Handles keyboard input, paste, and autocomplete scenarios
     * @param {HTMLInputElement} inputElement - The input field to normalize
     */
    function normalizeDecimalInput(inputElement) {
        // Primary handler: beforeinput (fires before value changes)
        inputElement.addEventListener('beforeinput', (e) => {
            // Only process text insertion events
            if (!e.data || !e.inputType.startsWith('insert')) return;

            // If input contains comma, convert to period
            if (e.data.includes(',')) {
                e.preventDefault();

                const start = e.target.selectionStart;
                const end = e.target.selectionEnd;
                const currentValue = e.target.value;

                // Replace commas with periods in the incoming data
                const normalizedData = e.data.replace(/,/g, '.');

                // Build new value
                const beforeSelection = currentValue.substring(0, start);
                const afterSelection = currentValue.substring(end);

                // Check if we're creating multiple decimal points
                const remainingValue = beforeSelection + afterSelection;
                if (normalizedData.includes('.') && remainingValue.includes('.')) {
                    // Don't allow multiple decimal separators
                    return;
                }

                // Set new value
                const newValue = beforeSelection + normalizedData + afterSelection;
                e.target.value = newValue;

                // Restore cursor position
                const newCursorPos = start + normalizedData.length;
                e.target.setSelectionRange(newCursorPos, newCursorPos);

                // Manually trigger input event for calculate()
                e.target.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });

        // Fallback handler: input (for paste, autocomplete, older browsers)
        inputElement.addEventListener('input', (e) => {
            const value = e.target.value;

            if (!value || !value.includes(',')) return;

            const cursorPos = e.target.selectionStart;

            // Replace commas with periods
            let normalizedValue = value.replace(/,/g, '.');

            // Handle multiple decimal separators (keep only first)
            const firstDotIndex = normalizedValue.indexOf('.');
            if (firstDotIndex !== -1) {
                const beforeDot = normalizedValue.substring(0, firstDotIndex);
                const afterDot = normalizedValue.substring(firstDotIndex + 1);
                const cleanedAfter = afterDot.replace(/\./g, ''); // Remove additional dots
                normalizedValue = beforeDot + '.' + cleanedAfter;
            }

            // Only update if value changed
            if (normalizedValue !== value) {
                e.target.value = normalizedValue;
                // Restore cursor position
                e.target.setSelectionRange(cursorPos, cursorPos);
            }
        });
    }

    // ==========================================
    // UI LOGIC FUNCTIONS
    // ==========================================
    function toggleMeasured() {
        isMeasuredVisible = true;
        els.posteriorInputs.classList.remove('hidden');
        els.addMeasuredContainer.classList.add('hidden');
        calculate();
    }

    function resetAndHidePK() {
        isMeasuredVisible = false;
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

    function selectEye(eye) {
        selectedEye = eye;

        if (eye === 'right') {
            els.eyeRight.classList.add('eye-selected');
            els.eyeLeft.classList.remove('eye-selected');
        } else {
            els.eyeLeft.classList.add('eye-selected');
            els.eyeRight.classList.remove('eye-selected');
        }

        // Populate form with cached data if available
        if (cachedBiomData) {
            populateEyeData(eye);
        }
    }

    /**
     * Extracts BiomPIN from user input (handles raw PIN or full URLs)
     * @param {string} input - Raw user input
     * @returns {string|null} - Extracted PIN or null if invalid
     */
    function extractBiomPIN(input) {
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
    function setLoadingState(loading) {
        isLoadingBiomPin = loading;

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
    function showBiomPinMessage(message, type = 'info') {
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
    function clearFormData() {
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

        selectedEye = null;
        els.eyeRight.classList.remove('eye-selected');
        els.eyeLeft.classList.remove('eye-selected');

        clearResults();
    }

    /**
     * Populates form with keratometry data for specific eye from cache
     * @param {string} eye - 'right' or 'left'
     */
    function populateEyeData(eye) {
        if (!cachedBiomData) return;

        const eyeKey = eye + '_eye';
        const eyeData = cachedBiomData[eyeKey];

        if (!eyeData) return;

        // Populate anterior keratometry only if keratometric index matches 1.3375
        if (eyeData.keratometric_index === IDX_SIMK) {
            els.kFlat.value = eyeData.K1_magnitude || '';
            els.axisFlat.value = eyeData.K1_axis || '';
            els.kSteep.value = eyeData.K2_magnitude || '';
            els.axisSteep.value = eyeData.K2_axis || '';
        }

        // Populate posterior keratometry if available
        if (cachedBiomData.has_pk && cachedBiomData.pk_data) {
            const pkData = cachedBiomData.pk_data[eyeKey];
            if (pkData) {
                els.pkFlat.value = pkData.PK1_magnitude || '';
                els.pAxisFlat.value = pkData.PK1_axis || '';
                els.pkSteep.value = pkData.PK2_magnitude || '';
                els.pAxisSteep.value = pkData.PK2_axis || '';
            }
        }

        calculate();
    }

    /**
     * Loads biometry data from BiomPIN API
     */
    async function loadBiomPIN() {
        if (isLoadingBiomPin) return;

        const inputValue = els.biomPinInput.value;
        const pin = extractBiomPIN(inputValue);

        if (!pin) {
            showBiomPinMessage('Invalid BiomPIN format. Expected: word-word-123456', 'error');
            return;
        }

        setLoadingState(true);
        showBiomPinMessage('Loading biometry data...', 'info');

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

            processBiomData(data);
            showBiomPinMessage(`Loaded data for ${data.data.patient.name || 'patient'}`, 'success');
            
            // Update URL with BiomPIN for easy sharing
            updateUrlWithPin(pin);

        } catch (error) {
            console.error('BiomPIN load error:', error);
            showBiomPinMessage(`Error: ${error.message}`, 'error');
        } finally {
            setLoadingState(false);
        }
    }

    /**
     * Processes API response and populates form
     * @param {Object} apiResponse - Full API response
     */
    function processBiomData(apiResponse) {
        const { data, extra_data } = apiResponse;

        clearFormData();

        const hasPK = extra_data?.posterior_keratometry?.right_eye &&
                      extra_data?.posterior_keratometry?.left_eye;

        cachedBiomData = {
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
        if (hasPK && !isMeasuredVisible) {
            toggleMeasured();
        } else if (!hasPK && isMeasuredVisible) {
            resetAndHidePK();
        }

        // Default to right eye
        selectEye('right');
        populateEyeData('right');
    }

    function updateBadge(axis) {
        if(isNaN(axis)) {
            els.axisTypeBadge.classList.add('hidden');
            return;
        }
        els.axisTypeBadge.classList.remove('hidden');
        let a = normalizeAxis(axis);

        let type = 'OBL';
        let classes = ['text-gray-500', 'bg-gray-200'];

        if (a >= 60 && a <= 120) {
            type = 'WTR';
            classes = ['text-green-600', 'bg-green-100'];
        } else if ((a >= 0 && a <= 30) || (a >= 150 && a <= 180)) {
            type = 'ATR';
            classes = ['text-orange-600', 'bg-orange-100'];
        }

        els.axisTypeBadge.innerText = type;
        els.axisTypeBadge.className = `px-1.5 py-0.5 rounded text-[9px] font-bold hidden uppercase tracking-wider ${classes.join(' ')}`;
        els.axisTypeBadge.classList.remove('hidden');
    }

    function clearResults() {
        els.dispK1.innerText = "--";
        els.dispK1Axis.innerText = "--";
        els.dispK2.innerText = "--";
        els.dispK2Axis.innerText = "--";
        els.resMeasMag.innerText = "-- D";
        els.resMeasAxis.innerText = "@ --°";
        els.resSoMag.innerText = "-- D";
        els.resSoAxis.innerText = "@ --°";
        els.resAkMag.innerText = "-- D";
        els.resAkAxis.innerText = "@ --°";
        els.resTkNetMag.innerText = "-- D";
        els.resTkNetAxis.innerText = "@ --°";

        // Hide print button when results are cleared
        if (els.printButtonContainer) {
            els.printButtonContainer.classList.add('hidden');
        }
    }

    function resetForm() {
        // Clear BiomPIN cache and input
        cachedBiomData = null;
        if (els.biomPinInput) els.biomPinInput.value = '';
        if (els.biomPinMessage) els.biomPinMessage.classList.add('hidden');

        // Clear form data
        clearFormData();
        resetAndHidePK();
        updateBadge(NaN);
        
        // Clear URL parameter
        clearUrlPin();
    }

    // ==========================================
    // CALCULATION FUNCTIONS
    // ==========================================
    function calculate() {
        const kFlat = parseFloat(els.kFlat.value);
        const kSteep = parseFloat(els.kSteep.value);
        const axisFlat = parseFloat(els.axisFlat.value);
        const axisSteep = parseFloat(els.axisSteep.value);

        if (isNaN(kFlat) || isNaN(kSteep) || isNaN(axisSteep)) {
            clearResults();
            if (els.analysisSection) {
                els.analysisSection.classList.add('hidden');
            }
            // Hide print button when analysis is hidden
            if (els.printButtonContainer) {
                els.printButtonContainer.classList.add('hidden');
            }
            return;
        }

        // Show analysis section when we have valid data
        if (els.analysisSection) {
            els.analysisSection.classList.remove('hidden');
        }
        // Show print button when analysis is visible
        if (els.printButtonContainer) {
            els.printButtonContainer.classList.remove('hidden');
        }

        // --- 1. Measured Anterior (SimK) ---
        const cylMeas = kSteep - kFlat;
        updateBadge(axisSteep);

        // Display Anterior K1/K2
        els.dispK1.innerText = kFlat.toFixed(2);
        els.dispK1Axis.innerText = axisFlat.toFixed(0);
        els.dispK2.innerText = kSteep.toFixed(2);
        els.dispK2Axis.innerText = axisSteep.toFixed(0);

        // Display Delta K
        els.resMeasMag.innerText = "+" + cylMeas.toFixed(2) + " D";
        els.resMeasAxis.innerText = "@ " + axisSteep.toFixed(0) + "°";

        // --- 2. SO (Savini Optimized) ---
        calculateSO(cylMeas, axisSteep);

        // --- 3. AK Regression ---
        calculateAK(cylMeas, axisSteep);

        // --- 4. TK (Measured) ---
        if (isMeasuredVisible) {
            calculateTK(kFlat, kSteep, axisSteep);
        }
    }

    function calculateAK(cylMeas, axisSteep) {
        const doubleAngleRad = 2 * toRadians(axisSteep);
        const xMeas = cylMeas * Math.cos(doubleAngleRad);
        const yMeas = cylMeas * Math.sin(doubleAngleRad);

        const xEst = AK_INTERCEPT_X + (AK_SLOPE_X * xMeas);
        const yEst = AK_INTERCEPT_Y + (AK_SLOPE_Y * yMeas);

        const cylNet = Math.sqrt(xEst*xEst + yEst*yEst);
        let doubleAngleNet = Math.atan2(yEst, xEst);
        let axisNet = toDegrees(doubleAngleNet) / 2.0;

        if (axisNet <= 0) axisNet += 180;
        if (axisNet > 180) axisNet -= 180;

        els.resAkMag.innerText = "+" + cylNet.toFixed(2) + " D";
        els.resAkAxis.innerText = "@ " + axisNet.toFixed(0) + "°";
    }

    function calculateSO(cylMeas, axisSteep) {
        // Convert axis to radians for the cosine term
        const axisRad = toRadians(axisSteep);

        // Apply Savini Placido regression: 0.103 + 0.836 × KA + 0.457 × cos(2α)
        let optimizedMag = SO_INTERCEPT + (SO_SLOPE * cylMeas) + (SO_COS_COEFF * Math.cos(2 * axisRad));

        // Handle negative magnitude: flip axis by 90 degrees
        let optimizedAxis = axisSteep;
        if (optimizedMag < 0) {
            optimizedMag = Math.abs(optimizedMag);
            optimizedAxis = normalizeAxis(axisSteep + 90);
        }

        // Normalize axis to [1, 180] range
        optimizedAxis = normalizeAxis(optimizedAxis);

        // Display results
        els.resSoMag.innerText = "+" + optimizedMag.toFixed(2) + " D";
        els.resSoAxis.innerText = "@ " + optimizedAxis.toFixed(0) + "°";
    }

    function calculateTK(kFlatSim, kSteepSim, axisSteepAnt) {
        let pkFlat = parseFloat(els.pkFlat.value);
        let pkSteep = parseFloat(els.pkSteep.value);
        const pAxisFlat = parseFloat(els.pAxisFlat.value);
        const pAxisSteep = parseFloat(els.pAxisSteep.value);
        const cct = CCT_DEFAULT; // Hardcoded default

        if (isNaN(pkFlat) || isNaN(pkSteep) || isNaN(pAxisSteep)) {
            // Hide TK/PK rows when data is incomplete
            els.tkValuesRow.classList.add('hidden');
            els.pkValuesRow.classList.add('hidden');
            // Hide delta TK grid elements
            els.deltaTkLabel.classList.add('hidden');
            els.resTkNetMag.classList.add('hidden');
            els.resTkNetAxis.classList.add('hidden');
            els.deltaTkSpacer.classList.add('hidden');
            els.deltaTkLegend.classList.add('hidden');
            return;
        }

        // Show TK and PK value rows
        els.tkValuesRow.classList.remove('hidden');
        els.pkValuesRow.classList.remove('hidden');
        // Show delta TK grid elements
        els.deltaTkLabel.classList.remove('hidden');
        els.resTkNetMag.classList.remove('hidden');
        els.resTkNetAxis.classList.remove('hidden');
        els.deltaTkSpacer.classList.remove('hidden');
        els.deltaTkLegend.classList.remove('hidden');

        // --- Display Measured Posterior ---
        // Display raw inputs
        els.dispPk1.innerText = pkFlat.toFixed(2);
        els.dispPk1Axis.innerText = pAxisFlat.toFixed(0);
        els.dispPk2.innerText = pkSteep.toFixed(2);
        els.dispPk2Axis.innerText = pAxisSteep.toFixed(0);

        // Force negative PK inputs if positive for TK calculation
        const pkFlatVal = -1 * Math.abs(pkFlat);
        const pkSteepVal = -1 * Math.abs(pkSteep);

        // --- A. Convert Anterior SimK to True Anterior Power (Vector) ---
        const rFlatAnt = (IDX_SIMK - 1) * 1000 / kFlatSim;
        const rSteepAnt = (IDX_SIMK - 1) * 1000 / kSteepSim;

        const pFlatAntReal = (IDX_ANT - 1) * 1000 / rFlatAnt;
        const pSteepAntReal = (IDX_ANT - 1) * 1000 / rSteepAnt;

        // Anterior Astigmatism Vector
        const daAnt = 2 * toRadians(axisSteepAnt);

        // Vector components of Anterior Cylinder
        const C_ant = pSteepAntReal - pFlatAntReal;
        const X_ant = C_ant * Math.cos(daAnt);
        const Y_ant = C_ant * Math.sin(daAnt);
        const M_ant = (pFlatAntReal + pSteepAntReal) / 2;

        // --- B. Vertex Posterior Power (Vector) ---
        // Gaussian Vertex Formula: P' = P / (1 - (t/n)*P)
        const thickMeters = cct / 1000000;
        const reducedThick = thickMeters / IDX_ANT;

        // Vertex Flat Power
        const P_post_flat_vertex = pkFlatVal / (1 - (reducedThick * pkFlatVal));
        // Vertex Steep Power
        const P_post_steep_vertex = pkSteepVal / (1 - (reducedThick * pkSteepVal));

        // Cyl is Steep - Flat
        const C_post = P_post_steep_vertex - P_post_flat_vertex;
        const daPost = 2 * toRadians(pAxisSteep);
        const X_post = C_post * Math.cos(daPost);
        const Y_post = C_post * Math.sin(daPost);
        const M_post = (P_post_flat_vertex + P_post_steep_vertex) / 2;

        // --- C. Sum Vectors (Gaussian Addition) ---
        const M_tot_gauss = M_ant + M_post;
        const X_tot = X_ant + X_post;
        const Y_tot = Y_ant + Y_post;

        // --- D. Reconstruct Total K with LIOU-BRENNAN Scaling ---
        // Scale Net Power to be "SimK-like"
        const M_tot_scaled = M_tot_gauss * MOD_LIOU_BRENNAN_SCALE_FACTOR;
        const X_tot_scaled = X_tot * MOD_LIOU_BRENNAN_SCALE_FACTOR;
        const Y_tot_scaled = Y_tot * MOD_LIOU_BRENNAN_SCALE_FACTOR;

        const C_tot_scaled = Math.sqrt(X_tot_scaled*X_tot_scaled + Y_tot_scaled*Y_tot_scaled);
        const daTot = Math.atan2(Y_tot_scaled, X_tot_scaled);
        let axisTot = toDegrees(daTot) / 2.0;
        if (axisTot <= 0) axisTot += 180;
        if (axisTot > 180) axisTot -= 180;

        // TK Steep/Flat derived from Scaled Mean Sphere and Scaled Cyl
        const tkSteep = M_tot_scaled + (C_tot_scaled / 2);
        const tkFlat = M_tot_scaled - (C_tot_scaled / 2);

        let tk1Axis = normalizeAxis(axisTot + 90);

        els.resTk1.innerText = tkFlat.toFixed(2);
        els.resTk1Axis.innerText = tk1Axis.toFixed(0);

        els.resTk2.innerText = tkSteep.toFixed(2);
        els.resTk2Axis.innerText = axisTot.toFixed(0);

        els.resTkNetMag.innerText = "+" + C_tot_scaled.toFixed(2) + " D";
        els.resTkNetAxis.innerText = "@ " + axisTot.toFixed(0) + "°";
    }

    // ==========================================
    // EVENT LISTENERS
    // ==========================================
    els.axisFlat.addEventListener('input', () => { syncAxis(els.axisFlat, els.axisSteep); calculate(); });
    els.axisSteep.addEventListener('input', () => { syncAxis(els.axisSteep, els.axisFlat); calculate(); });
    els.pAxisFlat.addEventListener('input', () => { syncAxis(els.pAxisFlat, els.pAxisSteep); calculate(); });
    els.pAxisSteep.addEventListener('input', () => { syncAxis(els.pAxisSteep, els.pAxisFlat); calculate(); });

    ['kFlat', 'kSteep', 'pkFlat', 'pkSteep'].forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            normalizeDecimalInput(el); // Add comma-to-period normalization
            el.addEventListener('input', calculate); // Existing handler
        }
    });

    // ==========================================
    // INITIALIZATION
    // ==========================================
    
    /**
     * Handles paste event on BiomPIN input to strip URLs and keep only the PIN
     * @param {ClipboardEvent} e - The paste event
     */
    function handleBiomPinPaste(e) {
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
    
    // Add paste event listener to BiomPIN input
    if (els.biomPinInput) {
        els.biomPinInput.addEventListener('paste', handleBiomPinPaste);
    }
    
    /**
     * Checks URL for BiomPIN parameter and auto-loads if present
     * Supports URL format: ?pin=word-word-123456
     */
    function checkUrlForBiomPin() {
        const urlParams = new URLSearchParams(window.location.search);
        const pin = urlParams.get('pin');
        
        if (pin) {
            // Populate the input field with the PIN from URL
            els.biomPinInput.value = pin;
            // Trigger the load function
            loadBiomPIN();
        }
    }
    
    /**
     * Updates the browser URL with BiomPIN for easy sharing
     * @param {string} pin - The BiomPIN to add to URL
     */
    function updateUrlWithPin(pin) {
        if (!pin) return;
        
        const url = new URL(window.location.href);
        url.searchParams.set('pin', pin);
        
        // Update URL without reloading the page
        window.history.replaceState({}, '', url.toString());
    }
    
    /**
     * Clears the BiomPIN from the browser URL
     */
    function clearUrlPin() {
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
    
    calculate();
    checkUrlForBiomPin();

    // ==========================================
    // PRINT FUNCTIONALITY
    // ==========================================

    /**
     * Prepares the print header with current patient data and triggers print
     */
    function printReport() {
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
            if (selectedEye === 'right') {
                eyeText = 'OD (Right Eye)';
                els.printEyeContainer.classList.add('eye-right');
            } else if (selectedEye === 'left') {
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

    // ==========================================
    // EXPOSE FUNCTIONS TO GLOBAL SCOPE
    // (Required for onclick handlers in HTML)
    // ==========================================
    window.resetForm = resetForm;
    window.toggleMeasured = toggleMeasured;
    window.resetAndHidePK = resetAndHidePK;
    window.selectEye = selectEye;
    window.loadBiomPIN = loadBiomPIN;
    window.printReport = printReport;

})();
