# BiomPIN JavaScript SDK

`biompin-sdk.js` is a lightweight, zero-dependency browser integration SDK for managing BiomPIN access history and patient identity context.

## 🚀 Loading the SDK

### 1. Direct CDN / Server Path (Recommended)
You can include the SDK directly from any running BiomAPI instance:

```html
<!-- Latest stable, unversioned path -->
<script src="https://biomapi.com/static/js/biompin-sdk.js"></script>

<!-- Or version-locked path for production caching -->
<script src="https://biomapi.com/static/v2.0.10/js/biompin-sdk.js"></script>
```

### 2. Modern ES Modules
```javascript
import './biompin-sdk.js';

const { history, context } = window.BiomPinSDK;
```

---

## 📂 1. Managing Local History (`BiomPinSDK.history`)

The history module provides a stateful `localStorage` manager to track recently processed or retrieved BiomPINs:

### Create Options

```javascript
const store = window.BiomPinSDK.history.create({
  storageKey: 'biompin_history', // LocalStorage key
  maxEntries: 250,               // Max number of entries to keep
  storage: window.localStorage   // Storage interface (for testing)
});
```

### Entry Schema

History entries have the following flat structure:

```javascript
{
  pin: "alpha-beta-123456",
  biompin: "alpha-beta-123456",
  patient_name: "JD",
  patient_id: "12345",
  expires_at: "2026-06-24T00:00:00Z",
  db_id: "db-instance-uuid",
  added_at: 1713456789000,
  accessed_at: "2026-05-24T23:00:00.000Z"
}
```

### Methods

- **`add({ dbId, pin, patientName, patientId, expiresAt })`**: Formats and stores an entry, pruning stale entries from older databases, deduping existing entries by PIN, and enforcing the capacity limit.
- **`list()`**: Returns all non-expired cached entries, newest first.
- **`search(query)`**: Case-insensitive search on patient name, patient ID, or PIN.
- **`pruneExpired()`**: Removes expired entries and returns kept entries.
- **`pruneDbIdMismatch(currentDbId)`**: Removes entries where the stored database ID differs from `currentDbId` (e.g. after database resets).
- **`clearOne(pin)`**: Deletes a single history entry by PIN.
- **`clearAll()`**: Purges the entire history cache.

---

## 🔒 2. Patient Identity Context (`BiomPinSDK.context`)

The context module manages stateless private patient identity context handoffs via URL fragment hashes (`#biomctx=...`), preventing sensitive identifiers from being transmitted to or stored on servers.

### Methods

- **`encode({ patientName, patientId })`**: Encodes patient identifiers into a URL-safe, base64url-encoded JSON string.
- **`decodeFromLocation(location)`**: Extracts and decodes the `#biomctx=...` fragment from a browser `location` or `URL` object. Returns `{ patientName, patientId }` or `null`.
- **`fromResponse(apiResponse)`**: Parses identity context from a standard BiomAPI JSON response.
- **`buildUrl(pin, identityContext)`**: Builds a relative BiomPIN path `/pin/...` including the `#biomctx` fragment.
- **`buildCalculatorUrl(baseUrl, pin, identityContext)`**: Builds an absolute target URL for an external calculator with a `?biompin=...` query parameter and `#biomctx` fragment.
- **`merge(pin, response, identityContext, historyEntries)`**: Merges redacted patient name and ID back into a decrypted/retrieved API response. It looks in `identityContext` first, falling back to local history entries matching the PIN.
