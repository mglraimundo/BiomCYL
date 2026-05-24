# BiomPIN Local History SDK

`biompin-history.js` is a dependency-free browser SDK for storing recent BiomPINs in `localStorage`. It does not call BiomAPI or any network endpoint. The host site only needs the current BiomAPI `db_id` after a stored history BiomPIN fails to retrieve.

## Installation

Load the SDK with a normal script tag:

```html
<script src="/js/biompin-history.js"></script>
<script>
  const history = window.BiomPinHistory.create();
</script>
```

The SDK exposes `window.BiomPinHistory`. It also supports CommonJS-style loading for simple test harnesses.

## Create Options

```js
const history = window.BiomPinHistory.create({
  storageKey: 'biompin_history',
  maxEntries: 50,
  storage: window.localStorage
});
```

- `storageKey`: localStorage key. Defaults to `biompin_history`.
- `maxEntries`: maximum entries to keep. Defaults to `50`.
- `storage`: optional localStorage-compatible object for testing.

## Entry Shape

Entries are stored most-recent-first:

```js
{
  biompin: "alpha-beta-123456",
  patient_name: "Doe, Jane",
  patient_id: "12345",
  expires_at: "2026-05-01T00:00:00Z",
  db_id: "abc123",
  added_at: 1713456789000
}
```

`expires_at` and `db_id` are required. `add(...)` throws if either is missing.

## Methods

### `add({ dbId, biomPin, patientName, patientId, expiresAt })`

Adds a BiomPIN entry, prunes entries from older database IDs using the added entry's `dbId`, dedupes by `biomPin`, moves the added entry to the top, enforces `maxEntries`, and returns the stored entry. `biomPin`, `dbId`, and `expiresAt` are required.

```js
history.add({
  dbId: "abc123",
  biomPin: "alpha-beta-123456",
  patientName: "Doe, Jane",
  patientId: "12345",
  expiresAt: "2026-05-01T00:00:00Z"
});
```

### `list()`

Returns a copy of all entries, newest first.

```js
const entries = history.list();
```

### `search(query)`

Returns entries whose `patient_name` or `patient_id` contains the query, case-insensitive. Empty queries return the same result as `list()`.

```js
const matches = history.search("jane");
```

### `isExpired(entryOrBiomPin)`

Checks whether an entry has a past `expires_at`. Accepts an entry object or BiomPIN string.

```js
history.isExpired("alpha-beta-123456");
```

### `hasDbIdMismatch(entryOrBiomPin, currentDbId)`

Checks whether an entry has a `db_id` that differs from the current BiomAPI database ID. Accepts an entry object or BiomPIN string.

```js
history.hasDbIdMismatch("alpha-beta-123456", "current-db-id");
```

### `pruneExpired()`

Removes expired entries and returns the kept entries.

```js
history.pruneExpired();
```

### `pruneDbIdMismatch(currentDbId)`

Removes entries whose stored `db_id` differs from `currentDbId` and returns the kept entries. This is intended for rare recovery flows, such as when a user clicks a stored history BiomPIN and retrieval fails.

```js
history.pruneDbIdMismatch("current-db-id");
```

### `clearOne(biomPin)`

Removes one BiomPIN and returns the kept entries.

```js
history.clearOne("alpha-beta-123456");
```

### `clearAll()`

Removes every stored entry and returns an empty array.

```js
history.clearAll();
```

### Identity Context and Recovery Methods

To support private data handling (where patient names and IDs are redacted from BiomPIN payloads stored on servers), the SDK provides helper methods to pass and reconstruct this private context in the browser using URL hash fragments.

#### `decodeIdentityContextFromLocation(location)`
Extracts, decodes, and parses a `#biomctx=...` hash fragment from a browser `Location` or standard `URL` object. Returns `{ patientName, patientId }` or `null`.

```js
const context = history.decodeIdentityContextFromLocation(window.location);
```

#### `mergeLocalIdentifiers(biomPin, apiResponse, identityContext)`
Reconstructs the patient's redacted `name` and `id` in the API response object. It looks for these values in the provided `identityContext` first, falling back to any matching PIN entry in the local history.

```js
const mergedResponse = history.mergeLocalIdentifiers(pin, response, context);
```

#### `encodeIdentityContext({ patientName, patientId })`
Encodes patient name and ID into a standard, URL-safe base64url string.

```js
const encoded = history.encodeIdentityContext({ patientName: "Jane Doe", patientId: "123" });
```

#### `identityContextFromResponse(response)`
Extracts the identity context from a standard API response.

```js
const context = history.identityContextFromResponse(response);
```

#### `buildBiomPINUrl(pin, identityContext)`
Builds a relative `/pin/${pin}` path containing the optional `#biomctx=...` fragment.

```js
const url = history.buildBiomPINUrl(pin, context);
```

#### `buildCalculatorUrl(baseUrl, pin, identityContext)`
Builds an absolute URL targeting a calculator at `baseUrl` with the `biompin` query param and the optional `#biomctx=...` fragment.

```js
const url = history.buildCalculatorUrl("https://calculator.com", pin, context);
```

## Minimal Example

```html
<script src="/js/biompin-history.js"></script>
<script>
  const history = window.BiomPinHistory.create();

  function refreshHistory() {
    history.pruneExpired();
    render(history.list());
  }

  function rememberBiomPin(apiResponse) {
    history.add({
      dbId: apiResponse.biompin?.db_id,
      biomPin: apiResponse.biompin?.pin || apiResponse.biom_pin,
      patientName: apiResponse.data?.patient?.name,
      patientId: apiResponse.data?.patient?.id,
      expiresAt: apiResponse.biompin.expires_at
    });
  }

  async function recoverAfterStoredPinFailure() {
    const response = await fetch("https://biomapi.com/api/v1/status", {
      headers: { "Accept": "application/json" }
    });
    const { db_id: currentDbId } = await response.json();
    history.pruneDbIdMismatch(currentDbId);
    render(history.list());
  }
</script>
```

## Recommended Flow

- On startup, call `pruneExpired()` and render `list()`. No status request is needed.
- On every successful BiomPIN retrieval or upload, call `add(...)`. The added entry's `dbId` is treated as current, so older mismatched database entries are pruned automatically.
- If a user loads a stored history BiomPIN and retrieval fails, fetch the current BiomAPI `db_id`, call `pruneDbIdMismatch(currentDbId)`, and refresh the UI.
- Database mismatch pruning should be rare; it mainly matters after breaking BiomAPI database rotations.

## Privacy

History is browser-local. It is stored in the user's current browser profile and is not synced by this SDK. The SDK has no cookies, telemetry, analytics, or network requests.
