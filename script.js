(function() {
    'use strict';

    // ==========================================
    // CONSTANTS & CONFIGURATION
    // ==========================================
    const AK_INTERCEPT_X = 0.508;
    const AK_SLOPE_X = 0.926;
    const AK_INTERCEPT_Y = 0.009;
    const AK_SLOPE_Y = 0.932;

    const IDX_SIMK = 1.3375;
    const IDX_ANT = 1.376;

    // Liou-Brennan Scale Factor (1.02116)
    // Manually modified to match IOL700 printouts to 1.0205 as per prior instructions
    const LIOU_BRENNAN_SCALE_FACTOR = 1.0205;

    const CCT_DEFAULT = 540;

    // ==========================================
    // STATE VARIABLES
    // ==========================================
    let isMeasuredVisible = false;
    let selectedEye = null;

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

        // Posterior Output Display
        pkSection: document.getElementById('pkSection'),
        dispPk1: document.getElementById('dispPk1'),
        dispPk1Axis: document.getElementById('dispPk1Axis'),
        dispPk2: document.getElementById('dispPk2'),
        dispPk2Axis: document.getElementById('dispPk2Axis'),
        resPkMag: document.getElementById('resPkMag'),
        resPkAxis: document.getElementById('resPkAxis'),

        // Total Keratometry Output
        tkSection: document.getElementById('tkSection'),
        resTk1: document.getElementById('resTk1'),
        resTk1Axis: document.getElementById('resTk1Axis'),
        resTk2: document.getElementById('resTk2'),
        resTk2Axis: document.getElementById('resTk2Axis'),
        resTkNetMag: document.getElementById('resTkNetMag'),
        resTkNetAxis: document.getElementById('resTkNetAxis'),

        // UI Elements
        posteriorInputs: document.getElementById('posteriorInputs'),
        addMeasuredContainer: document.getElementById('addMeasuredContainer'),
        axisTypeBadge: document.getElementById('axisTypeBadge'),

        // Patient Data Elements
        patientName: document.getElementById('patientName'),
        patientId: document.getElementById('patientId'),
        eyeRight: document.getElementById('eyeRight'),
        eyeLeft: document.getElementById('eyeLeft'),

        // Print Elements
        printPatientName: document.getElementById('printPatientName'),
        printPatientId: document.getElementById('printPatientId'),
        printEye: document.getElementById('printEye'),
        printDate: document.getElementById('printDate')
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

    // ==========================================
    // UI LOGIC FUNCTIONS
    // ==========================================
    function toggleMeasured() {
        isMeasuredVisible = true;
        els.posteriorInputs.classList.remove('hidden');
        els.tkSection.classList.remove('hidden');
        els.pkSection.classList.remove('hidden');
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
        els.tkSection.classList.add('hidden');
        els.pkSection.classList.add('hidden');
        els.addMeasuredContainer.classList.remove('hidden');
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
    }

    function printReport() {
        // Validate eye selection
        if (!selectedEye) {
            alert('Please select an eye (Right or Left) before printing.');
            return;
        }

        // Optional: Validate data exists
        const kFlat = parseFloat(els.kFlat.value);
        const kSteep = parseFloat(els.kSteep.value);

        if (isNaN(kFlat) || isNaN(kSteep)) {
            const confirmPrint = confirm('No analysis results available. Print anyway?');
            if (!confirmPrint) return;
        }

        // Populate print-only fields
        const patientName = els.patientName.value || 'Not provided';
        const patientId = els.patientId.value || 'Not provided';
        const eyeText = selectedEye === 'right' ? 'Right Eye (OD)' : 'Left Eye (OS)';
        const currentDate = new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        els.printPatientName.textContent = patientName;
        els.printPatientId.textContent = patientId;
        els.printEye.textContent = eyeText;
        els.printDate.textContent = currentDate;

        // Trigger browser print dialog
        window.print();
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
        els.resAkMag.innerText = "-- D";
        els.resAkAxis.innerText = "@ --°";
        els.resTkNetMag.innerText = "-- D";
        els.resTkNetAxis.innerText = "@ --°";
    }

    function resetForm() {
        ['kFlat', 'kSteep', 'axisFlat', 'axisSteep', 'pkFlat', 'pkSteep', 'pAxisFlat', 'pAxisSteep'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = "";
        });
        resetAndHidePK();
        updateBadge(NaN);
        clearResults();
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
            return;
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

        // --- 2. AK Regression ---
        calculateAK(cylMeas, axisSteep);

        // --- 3. TK (Measured) ---
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

    function calculateTK(kFlatSim, kSteepSim, axisSteepAnt) {
        let pkFlat = parseFloat(els.pkFlat.value);
        let pkSteep = parseFloat(els.pkSteep.value);
        const pAxisFlat = parseFloat(els.pAxisFlat.value);
        const pAxisSteep = parseFloat(els.pAxisSteep.value);
        const cct = CCT_DEFAULT; // Hardcoded default

        if (isNaN(pkFlat) || isNaN(pkSteep) || isNaN(pAxisSteep)) {
             els.resTkNetMag.innerText = "-- D";
             els.resTkNetAxis.innerText = "@ --°";
             return;
        }

        // --- Display Measured Posterior ---
        // Display raw inputs
        els.dispPk1.innerText = pkFlat.toFixed(2);
        els.dispPk1Axis.innerText = pAxisFlat.toFixed(0);
        els.dispPk2.innerText = pkSteep.toFixed(2);
        els.dispPk2Axis.innerText = pAxisSteep.toFixed(0);

        // Calculate Delta PK (Magnitude difference)
        // Posterior astigmatism is the difference between principal meridians
        const deltaPK = Math.abs(pkSteep - pkFlat);
        els.resPkMag.innerText = "+" + deltaPK.toFixed(2) + " D";
        els.resPkAxis.innerText = "@ " + pAxisSteep.toFixed(0) + "°";

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
        const M_tot_scaled = M_tot_gauss * LIOU_BRENNAN_SCALE_FACTOR;
        const X_tot_scaled = X_tot * LIOU_BRENNAN_SCALE_FACTOR;
        const Y_tot_scaled = Y_tot * LIOU_BRENNAN_SCALE_FACTOR;

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
        if(el) el.addEventListener('input', calculate);
    });

    // ==========================================
    // INITIALIZATION
    // ==========================================
    calculate();

    // ==========================================
    // EXPOSE FUNCTIONS TO GLOBAL SCOPE
    // (Required for onclick handlers in HTML)
    // ==========================================
    window.resetForm = resetForm;
    window.toggleMeasured = toggleMeasured;
    window.resetAndHidePK = resetAndHidePK;
    window.selectEye = selectEye;
    window.printReport = printReport;

})();
