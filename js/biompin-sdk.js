/**
 * BiomPIN Browser SDK
 * Core browser-side library for managing BiomPIN access history and patient identity context.
 * 
 * Supports standard browser script tags (exposing window.BiomPinSDK),
 * CommonJS (module.exports), and ES6 Module imports.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
        define(factory);
    } else {
        root.BiomPinSDK = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Utilities
    function normalizeString(value) {
        return value == null ? '' : String(value).trim();
    }

    function cloneEntry(entry) {
        if (!entry) return null;
        return {
            pin: entry.pin || entry.biompin,
            biompin: entry.biompin || entry.pin,
            patient_name: entry.patient_name,
            patient_id: entry.patient_id,
            expires_at: entry.expires_at,
            db_id: entry.db_id,
            added_at: entry.added_at || entry.accessed_at,
            accessed_at: entry.accessed_at || entry.added_at
        };
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

    /**
     * History Manager (Stateful localStorage client)
     */
    function createHistoryStore(options = {}) {
        const storage = options.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        const storageKey = options.storageKey || 'biompin_history';
        const maxEntries = Number.isFinite(options.maxEntries) && options.maxEntries > 0
            ? Math.floor(options.maxEntries)
            : 250;

        if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
            throw new Error('BiomPinSDK.history requires a localStorage-compatible storage object.');
        }

        function readEntries() {
            const raw = storage.getItem(storageKey);
            if (!raw) return [];
            try {
                const parsed = JSON.parse(raw);
                return Array.isArray(parsed) ? parsed.filter(Boolean).map(cloneEntry) : [];
            } catch {
                return [];
            }
        }

        function writeEntries(entries) {
            try {
                storage.setItem(storageKey, JSON.stringify(entries.map(cloneEntry)));
            } catch (e) {
                // Ignore DOMException storage quota exceeded errors gracefully
            }
        }

        function resolveEntry(entryOrBiomPin) {
            if (entryOrBiomPin && typeof entryOrBiomPin === 'object') return entryOrBiomPin;
            const targetPin = normalizeString(entryOrBiomPin);
            return readEntries().find(entry => entry.pin === targetPin || entry.biompin === targetPin) || null;
        }

        function list() {
            return readEntries();
        }

        function search(query) {
            const q = normalizeString(query).toLowerCase();
            if (!q) return list();

            return readEntries().filter(entry => 
                normalizeString(entry.patient_name).toLowerCase().includes(q) ||
                normalizeString(entry.patient_id).toLowerCase().includes(q) ||
                normalizeString(entry.pin).toLowerCase().includes(q)
            );
        }

        function add({ dbId, biomPin, pin, patientName, patientId, expiresAt }) {
            const resolvedPin = normalizeString(biomPin || pin).trim();
            if (!resolvedPin) {
                throw new Error('BiomPinSDK.history.add requires a pin.');
            }

            const currentDbId = normalizeString(dbId);
            const entryExpiresAt = normalizeString(expiresAt);
            const now = Date.now();

            const existingHistory = readEntries();
            const existingEntry = existingHistory.find(item => item.pin === resolvedPin);

            const entry = {
                pin: resolvedPin,
                biompin: resolvedPin,
                patient_name: normalizeString(patientName) || existingEntry?.patient_name || null,
                patient_id: normalizeString(patientId) || existingEntry?.patient_id || null,
                expires_at: entryExpiresAt || existingEntry?.expires_at || null,
                db_id: currentDbId || existingEntry?.db_id || null,
                added_at: now,
                accessed_at: new Date().toISOString()
            };

            // Prune entries from older database instances (if dbId matches the added entry's database ID)
            // Deduplicate the current entry by PIN
            const filtered = existingHistory
                .filter(item => !entry.db_id || !item.db_id || item.db_id === entry.db_id)
                .filter(item => item.pin !== resolvedPin);

            filtered.unshift(entry);
            writeEntries(filtered.slice(0, maxEntries));
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
            const targetDbId = normalizeString(currentDbId);
            if (!entry || !entry.db_id || !targetDbId) return false;
            return entry.db_id !== targetDbId;
        }

        function pruneExpired() {
            const entries = readEntries();
            const kept = entries.filter(entry => !isExpired(entry));
            if (kept.length !== entries.length) writeEntries(kept);
            return kept;
        }

        function pruneDbIdMismatch(currentDbId) {
            const entries = readEntries();
            const targetDbId = normalizeString(currentDbId);
            if (!targetDbId) return entries;
            
            const kept = entries.filter(entry => !hasDbIdMismatch(entry, targetDbId));
            if (kept.length !== entries.length) writeEntries(kept);
            return kept;
        }

        function clearOne(biomPin) {
            const targetPin = normalizeString(biomPin);
            const entries = readEntries();
            const kept = entries.filter(entry => entry.pin !== targetPin && entry.biompin !== targetPin);
            if (kept.length !== entries.length) writeEntries(kept);
            return kept;
        }

        function clearAll() {
            writeEntries([]);
            return [];
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
            clearAll
        };
    }

    /**
     * Patient Identity Context Helpers (Stateless handoff utilities)
     */
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

    function decodeIdentityContextFromLocation(location = typeof window !== 'undefined' ? window.location : null) {
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

        const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
        const url = new URL(baseUrl, origin);
        url.searchParams.set('biompin', pin);
        return appendIdentityFragment(url.toString(), identityContext);
    }

    function mergeLocalIdentifiers(pin, response, identityContext = null, historyEntries = []) {
        if (!pin || !response?.data?.patient) return response;

        const targetPin = normalizeString(pin);
        const historyEntry = historyEntries.find(item => item.pin === targetPin || item.biompin === targetPin);
        
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

    // Exposed API
    return {
        history: {
            create: createHistoryStore
        },
        context: {
            encode: encodeIdentityContext,
            decodeFromLocation: decodeIdentityContextFromLocation,
            fromResponse: identityContextFromResponse,
            buildUrl: buildBiomPINUrl,
            buildCalculatorUrl: buildCalculatorUrl,
            merge: mergeLocalIdentifiers,
            
            // Raw base64 primitives for low-level access
            base64UrlEncode,
            base64UrlDecode,
            normalizeIdentityContext,

            // Older aliases for backwards compatibility
            encodeIdentityContext,
            decodeIdentityContextFromLocation,
            identityContextFromResponse,
            buildBiomPINUrl,
            mergeLocalIdentifiers
        }
    };
}));
