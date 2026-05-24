/**
 * BiomPIN Local History SDK
 * Browser-local storage helper for recent BiomPINs.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.BiomPinHistory = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const DEFAULT_STORAGE_KEY = 'biompin_history';
    const DEFAULT_MAX_ENTRIES = 50;

    function parseEntries(raw) {
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
        } catch {
            return [];
        }
    }

    function normalizeString(value) {
        return value == null ? '' : String(value);
    }

    function cloneEntry(entry) {
        return {
            biompin: entry.biompin,
            patient_name: entry.patient_name,
            patient_id: entry.patient_id,
            expires_at: entry.expires_at,
            db_id: entry.db_id,
            added_at: entry.added_at,
        };
    }

    function create(options = {}) {
        const storage = options.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        const storageKey = options.storageKey || DEFAULT_STORAGE_KEY;
        const maxEntries = Number.isFinite(options.maxEntries) && options.maxEntries > 0
            ? Math.floor(options.maxEntries)
            : DEFAULT_MAX_ENTRIES;

        if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
            throw new Error('BiomPinHistory requires a localStorage-compatible storage object.');
        }

        function readEntries() {
            return parseEntries(storage.getItem(storageKey));
        }

        function writeEntries(entries) {
            storage.setItem(storageKey, JSON.stringify(entries.map(cloneEntry)));
        }

        function resolveEntry(entryOrBiomPin) {
            if (entryOrBiomPin && typeof entryOrBiomPin === 'object') return entryOrBiomPin;
            const biomPin = normalizeString(entryOrBiomPin);
            return readEntries().find(entry => entry.biompin === biomPin) || null;
        }

        function list() {
            return readEntries().map(cloneEntry);
        }

        function search(query) {
            const q = normalizeString(query).trim().toLowerCase();
            if (!q) return list();

            return readEntries()
                .filter(entry =>
                    normalizeString(entry.patient_name).toLowerCase().includes(q) ||
                    normalizeString(entry.patient_id).toLowerCase().includes(q)
                )
                .map(cloneEntry);
        }

        function add({ dbId, biomPin, patientName, patientId, expiresAt }) {
            const biompin = normalizeString(biomPin).trim();
            if (!biompin) {
                throw new Error('BiomPinHistory.add requires a biomPin.');
            }
            if (dbId == null || dbId === '') {
                throw new Error('BiomPinHistory.add requires a dbId.');
            }
            if (expiresAt == null || expiresAt === '') {
                throw new Error('BiomPinHistory.add requires an expiresAt.');
            }

            const entry = {
                biompin,
                patient_name: normalizeString(patientName),
                patient_id: normalizeString(patientId),
                expires_at: String(expiresAt),
                db_id: String(dbId),
                added_at: Date.now(),
            };

            const entries = readEntries()
                .filter(existing => existing.db_id === entry.db_id)
                .filter(existing => existing.biompin !== biompin);
            entries.unshift(entry);
            writeEntries(entries.slice(0, maxEntries));
            return cloneEntry(entry);
        }

        function isExpired(entryOrBiomPin) {
            const entry = resolveEntry(entryOrBiomPin);
            if (!entry || !entry.expires_at) return false;

            const expiry = new Date(entry.expires_at).getTime();
            return Number.isFinite(expiry) && expiry <= Date.now();
        }

        function hasDbIdMismatch(entryOrBiomPin, currentDbId) {
            const entry = resolveEntry(entryOrBiomPin);
            if (!entry || currentDbId == null || currentDbId === '') return false;
            return entry.db_id !== String(currentDbId);
        }

        function pruneExpired() {
            const entries = readEntries();
            const kept = entries.filter(entry => !isExpired(entry));
            if (kept.length !== entries.length) writeEntries(kept);
            return kept.map(cloneEntry);
        }

        function pruneDbIdMismatch(currentDbId) {
            const entries = readEntries();
            const kept = entries.filter(entry => !hasDbIdMismatch(entry, currentDbId));
            if (kept.length !== entries.length) writeEntries(kept);
            return kept.map(cloneEntry);
        }

        function clearOne(biomPin) {
            const biompin = normalizeString(biomPin);
            const entries = readEntries();
            const kept = entries.filter(entry => entry.biompin !== biompin);
            if (kept.length !== entries.length) writeEntries(kept);
            return kept.map(cloneEntry);
        }

        function clearAll() {
            writeEntries([]);
            return [];
        }

        function base64UrlEncode(value) {
            const bytes = new TextEncoder().encode(value);
            let binary = '';
            bytes.forEach(byte => {
                binary += String.fromCharCode(byte);
            });
            return btoa(binary)
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/g, '');
        }

        function base64UrlDecode(value) {
            const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
            const binary = atob(padded);
            const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
            return new TextDecoder().decode(bytes);
        }

        function normalizeIdentityContext(identityContext) {
            if (!identityContext) return null;
            const patientName = identityContext.patientName || identityContext.patient_name || null;
            const patientId = identityContext.patientId || identityContext.patient_id || null;

            if (!patientName && !patientId) return null;

            return {
                v: 1,
                patient_name: patientName || null,
                patient_id: patientId || null
            };
        }

        function encodeIdentityContext({ patientName, patientId } = {}) {
            const context = normalizeIdentityContext({ patientName, patientId });
            if (!context) return null;
            return base64UrlEncode(JSON.stringify(context));
        }

        function decodeIdentityContextFromLocation(location = window.location) {
            const hash = location?.hash || '';
            if (!hash) return null;

            const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
            const encoded = params.get('biomctx');
            if (!encoded) return null;

            try {
                const parsed = JSON.parse(base64UrlDecode(encoded));
                if (parsed.v !== undefined && parsed.v !== 1) return null;
                const patientName = parsed.patient_name || null;
                const patientId = parsed.patient_id || null;
                return patientName || patientId ? { patientName, patientId } : null;
            } catch {
                return null;
            }
        }

        function appendIdentityFragment(url, identityContext) {
            const context = normalizeIdentityContext(identityContext);
            if (!context) return url;

            const encoded = encodeIdentityContext({
                patientName: context.patient_name,
                patientId: context.patient_id
            });
            if (!encoded) return url;

            return `${url}#biomctx=${encoded}`;
        }

        function buildBiomPINUrl(pin, identityContext = null) {
            if (!pin) return '';
            return appendIdentityFragment(`/pin/${encodeURIComponent(pin)}`, identityContext);
        }

        function buildCalculatorUrl(baseUrl, pin, identityContext = null) {
            if (!baseUrl || !pin) return '';

            const url = new URL(baseUrl, window.location.origin);
            url.searchParams.set('biompin', pin);
            return appendIdentityFragment(url.toString(), identityContext);
        }

        function mergeLocalIdentifiers(pin, response, identityContext = null) {
            if (!pin || !response?.data?.patient) return response;

            const historyEntry = readEntries().find(item => item.biompin === pin);
            const patientName = response.data.patient.name || identityContext?.patientName || identityContext?.patient_name || historyEntry?.patient_name || null;
            const patientId = response.data.patient.id || identityContext?.patientId || identityContext?.patient_id || historyEntry?.patient_id || null;

            response.data.patient.name = patientName;
            response.data.patient.id = patientId;

            return response;
        }

        function identityContextFromResponse(response) {
            const patient = response?.data?.patient;
            if (!patient) return null;
            return normalizeIdentityContext({
                patientName: patient.name,
                patientId: patient.id
            });
        }

        return {
            add,
            list,
            search,
            isExpired,
            hasDbIdMismatch,
            pruneExpired,
            pruneDbIdMismatch,
            clearOne,
            clearAll,
            base64UrlEncode,
            base64UrlDecode,
            normalizeIdentityContext,
            encodeIdentityContext,
            decodeIdentityContextFromLocation,
            buildBiomPINUrl,
            buildCalculatorUrl,
            mergeLocalIdentifiers,
            identityContextFromResponse
        };
    }

    return {
        create,
        defaults: {
            storageKey: DEFAULT_STORAGE_KEY,
            maxEntries: DEFAULT_MAX_ENTRIES,
        },
    };
}));
