/**
 * BiomCYL Calculations Module
 * Contains constants, utility functions, and calculation logic
 */

// ==========================================
// CONSTANTS & CONFIGURATION
// ==========================================
export const AK_INTERCEPT_X = 0.508;
export const AK_SLOPE_X = 0.926;
export const AK_INTERCEPT_Y = 0.009;
export const AK_SLOPE_Y = 0.932;

// Savini Optimized Astigmatism (Placido) - Savini et al. JCRS 2017
export const SO_INTERCEPT = 0.103;
export const SO_SLOPE = 0.836;
export const SO_COS_COEFF = 0.457;

export const IDX_SIMK = 1.3375;
export const IDX_ANT = 1.376;

// Liou-Brennan Scale Factor (1.02116)
// Manually modified to match IOL700 printouts to 1.0205 as per prior instructions
export const MOD_LIOU_BRENNAN_SCALE_FACTOR = 1.0205;

export const CCT_DEFAULT = 540;

// ==========================================
// UTILITY FUNCTIONS
// ==========================================
export function toRadians(deg) {
    return deg * (Math.PI / 180);
}

export function toDegrees(rad) {
    return rad * (180 / Math.PI);
}

export function normalizeAxis(angle) {
    let a = angle % 180;
    if (a <= 0) a += 180;
    return a;
}

export function syncAxis(source, target) {
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
export function normalizeDecimalInput(inputElement) {
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
// CALCULATION FUNCTIONS
// ==========================================

// Import els from ui.js - circular dependency handled by ES6 modules
import { els, state } from './ui.js';

export function updateBadge(axis) {
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

export function clearResults() {
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

export function calculate() {
    const kFlat = parseFloat(els.kFlat.value);
    const kSteep = parseFloat(els.kSteep.value);
    const axisFlat = parseFloat(els.axisFlat.value);
    const axisSteep = parseFloat(els.axisSteep.value);

    if (isNaN(kFlat) || isNaN(kSteep) || isNaN(axisSteep)) {
        clearResults();
        if (els.analysisSection) {
            els.analysisSection.classList.add('hidden');
        }
        if (els.analysisHr) {
            els.analysisHr.classList.add('hidden');
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
    if (els.analysisHr) {
        els.analysisHr.classList.remove('hidden');
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
    if (state.isMeasuredVisible) {
        calculateTK(kFlat, kSteep, axisSteep);
    }
}

export function calculateAK(cylMeas, axisSteep) {
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

export function calculateSO(cylMeas, axisSteep) {
    // Convert axis to radians for the cosine term
    const axisRad = toRadians(axisSteep);

    // Apply Savini Placido regression: 0.103 + 0.836 * KA + 0.457 * cos(2a)
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

export function calculateTK(kFlatSim, kSteepSim, axisSteepAnt) {
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
