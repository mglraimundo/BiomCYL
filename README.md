# CYL

**Corneal astigmatism analyser & reference open-source BiomAPI integration.**

Live site: [cyl.mraimundo.com](https://cyl.mraimundo.com)

CYL serves two audiences at once:

1. **Cataract surgeons** who need to work up corneal astigmatism for toric IOL planning — computing Savini-optimized (ΔSO) and Abulafia-Koch regression (ΔAK) deltas from keratometry, with optional posterior keratometry correction (ΔTK) from a Zeiss IOLMaster 700.
2. **Developers** who want to see a complete, minimal, production-shaped implementation of a [BiomAPI](https://biomapi.com) client — how to retrieve biometry by PIN, upload a printout for OCR, handle URL pastes, persist a local history, and surface the parsed data without a backend.

This README is the entry point for both. If you're here for the clinical tool, jump to [Live site](#live-site). If you're here to learn how to consume BiomAPI, start at [BiomAPI integration patterns](#biomapi-integration-patterns) and then read the code — the BiomAPI integration lives in [`js/biompin.js`](js/biompin.js), with reusable local history storage in [`js/biompin-history.js`](js/biompin-history.js).

> **Technology preview.** CYL is not a medical device. The values it extracts from BiomAPI and the calculations it runs should be independently verified before any clinical decision. See [Disclaimer](#disclaimer).

---

## Table of contents

- [Live site](#live-site)
- [Clinical features](#clinical-features)
- [Supported biometers](#supported-biometers)
- [BiomAPI integration patterns](#biomapi-integration-patterns)
  - [PIN paste with URL stripping](#pin-paste-with-url-stripping)
  - [File upload (PDF / image / JSON)](#file-upload-pdf--image--json)
  - [Retrieve by PIN](#retrieve-by-pin)
  - [Status endpoint & stale-history pruning](#status-endpoint--stale-history-pruning)
  - [Parsed data shape (`state.cachedBiomData`)](#parsed-data-shape-statecachedbiomdata)
  - [JSON view mode (`?view=json`)](#json-view-mode-viewjson)
- [Local history](#local-history)
- [Privacy posture](#privacy-posture)
- [PWA, offline, iOS install](#pwa-offline-ios-install)
- [Repository layout](#repository-layout)
- [Local development](#local-development)
- [Version bumping protocol](#version-bumping-protocol)
- [Disclaimer](#disclaimer)
- [Contributing & license](#contributing--license)

---

## Live site

[**cyl.mraimundo.com**](https://cyl.mraimundo.com) — installs as a PWA on iOS and Android.

Share a pre-loaded PIN by appending `?biompin=word-word-123456` to the URL. Share the JSON view of a PIN by appending `&view=json`.

---

## Clinical features

- **Anterior keratometry** — ΔK from K1/K2 magnitudes and axes.
- **Posterior keratometry** — optional measured PK input (valid only for the Zeiss IOLMaster 700).
- **Total keratometry** — Gaussian thick-lens formula with a modified Liou–Brennan scaling to match IOLMaster 700 TK values (ΔTK).
- **Savini optimized astigmatism (ΔSO)** — Placido-disk regression coefficients per [Savini et al., *JCRS* 2017](https://doi.org/10.1016/j.jcrs.2017.06.040).
- **Abulafia-Koch regression (ΔAK)** — PCA-adjusted optimized astigmatism per [Abulafia & Koch et al., *JCRS* 2016](https://doi.org/10.1016/j.jcrs.2016.02.038).
- **Printable report** — clinical summary layout (A4, patient header, keratometry values, deltas).
- **BiomAPI autofill** — paste a PIN or upload a printout to populate all fields.

---

## Supported biometers

BiomAPI's printout OCR and JSON ingest have been tested and optimized for:

| Vendor | Device |
| --- | --- |
| Alcon | Argos |
| Haag-Streit | Eyestar 900 |
| Haag-Streit | Lenstar 900 |
| Heidelberg | Anterion |
| OCULUS | Pentacam AXL |
| Tomey | OA-2000 |
| Topcon | Aladdin |
| ZEISS | IOLMaster 700 |

Other devices may parse successfully but have not been validated — verify extracted values before use.

---

## BiomAPI integration patterns

All BiomAPI-facing code lives in [`js/biompin.js`](js/biompin.js). It stays dependency-free and delegates reusable browser history storage to [`js/biompin-history.js`](js/biompin-history.js). Below are the patterns CYL implements.

### PIN paste with URL stripping

Users commonly paste the full BiomAPI URL (`https://biomapi.com/pin/alpha-beta-123456`) instead of just the PIN. CYL strips the URL on paste with a single regex:

```js
// js/biompin.js
export function extractBiomPIN(input) {
    if (!input || typeof input !== 'string') return null;
    const pinRegex = /([a-z]+-[a-z]+-\d{6})/i;
    const match = input.trim().match(pinRegex);
    return match ? match[1].toLowerCase() : null;
}
```

The paste handler only rewrites the input when the pasted text isn't already a bare PIN, so typing works unchanged:

```js
export function handleBiomPinPaste(e) {
    const pastedText = e.clipboardData?.getData('text');
    if (!pastedText) return;
    const pin = extractBiomPIN(pastedText);
    if (pin && pastedText !== pin) {
        e.preventDefault();
        els.biomPinInput.value = pin;
    }
}
```

### File upload (PDF / image / JSON)

A file-picker accepts PDF, image (JPG/PNG/GIF/BMP), and JSON printout exports up to **15 MB**. Validation happens client-side before `POST`:

```js
const validExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.json'];
const maxSize = 15 * 1024 * 1024; // 15 MB
```

The upload itself is a standard `FormData` POST:

```js
const formData = new FormData();
formData.append('file', file);
formData.append('biompin', 'true'); // ask BiomAPI to mint a PIN for the upload

const response = await fetch('https://biomapi.com/api/v1/biom/process', {
    method: 'POST',
    headers: { 'Accept': 'application/json' },
    body: formData
});
```

Error responses are mapped to user-friendly messages (`HTTP 413 → "File too large"`, `HTTP 429 → "Rate limit exceeded"`, etc.) in `handleFileUploadError()`.

### Retrieve by PIN

A simple `GET` with the PIN in the query string. The PIN is validated via the same regex before the request so malformed input never hits the network:

```js
const apiUrl = `https://biomapi.com/api/v1/biom/retrieve?biom_pin=${encodeURIComponent(pin)}`;
const response = await fetch(apiUrl, {
    method: 'GET',
    headers: { 'Accept': 'application/json' }
});
```

After a successful retrieve, CYL:

1. caches the parsed payload into `state.cachedBiomData`,
2. pushes the PIN into the URL via `history.replaceState` so the page is shareable,
3. adds the entry to local history,
4. populates the calculator and triggers a recompute.

### Status endpoint & stale-history pruning

CYL does not call the status endpoint on startup. Expired local history entries are pruned locally, and db-id mismatch pruning is lazy: every successful BiomPIN response is treated as the current database and prunes older mismatched entries. CYL only asks BiomAPI for status after a stored history PIN fails to load:

```js
const res = await fetch('https://biomapi.com/api/v1/status', {
    headers: { 'Accept': 'application/json' }
});
const { db_id } = await res.json();
```

### Parsed data shape (`state.cachedBiomData`)

All downstream code (form population, calculations, JSON view, print) reads from a single cached object. This is the canonical structure CYL works with:

```js
state.cachedBiomData = {
  patient: {
    name: "Doe, Jane",
    id: "12345"
  },
  right_eye: {
    K1_magnitude: 43.12,
    K1_axis: 178,
    K2_magnitude: 44.28,
    K2_axis: 88,
    keratometric_index: 1.3375
  },
  left_eye: {
    K1_magnitude: 43.05,
    K1_axis: 2,
    K2_magnitude: 44.15,
    K2_axis: 92,
    keratometric_index: 1.3375
  },
  has_pk: true,
  pk_data: {
    right_eye: {
      PK1_magnitude: -6.21,
      PK1_axis: 88,
      PK2_magnitude: -6.45,
      PK2_axis: 178
    },
    left_eye: { /* ... */ }
  }
};
```

Only keratometry measured at the standard keratometric index (`1.3375`) populates the form — other indices are displayed via the JSON view but not auto-filled, since their interpretation depends on device-specific assumptions.

### JSON view mode (`?view=json`)

Append `?view=json` to any CYL URL (or click `{ } JSON` in the footer) to hide the calculator and show the full BiomAPI response as prettified JSON (the complete payload — `data`, `extra_data`, `biom_pin`, `biompin`, etc. — not just the subset CYL uses). The BiomAPI load section stays visible so you can paste a PIN, upload a file, or pick from history and immediately see the raw response.

Useful when:
- You're implementing BiomAPI against your own biometers and want a quick reference of what the API returns for each device.
- You want to share a specific biometry's JSON with a colleague — send `https://cyl.mraimundo.com/?biompin=<PIN>&view=json`.
- You're debugging a printout that parsed unexpectedly.

A copy-to-clipboard button in the JSON pane copies the prettified payload verbatim.

---

## Local history

CYL uses the standalone [`BiomPIN Local History SDK`](js/biompin-history.README.md) to persist every successful load into `localStorage` under the key `biompin_history`. The store is a plain JSON array of entries:

```js
{
  biompin: "alpha-beta-123456",
  patient_name: "Doe, Jane",
  patient_id:   "12345",
  expires_at:   "2026-05-01T00:00:00Z",
  db_id:        "abc123",
  added_at:     1713456789000
}
```

Characteristics:

- **Max 50 entries**, most-recent-first (oldest drops off).
- **Deduped by PIN** — re-loading an existing PIN moves it to the top.
- **Auto-pruned** on page load when BiomAPI reports a new `db_id` or the entry's `expires_at` has passed.
- **Browser-local** — nothing is ever synced anywhere. History on iOS Safari ≠ history on a desktop.
- **Searchable** by patient name or ID.
- **One-click load** — clicking an entry re-fetches from BiomAPI and repopulates the calculator.

Storage, expiry, lazy db-id mismatch pruning, and clearing are handled by [`js/biompin-history.js`](js/biompin-history.js). `db_id` and `expires_at` are required by the SDK because BiomAPI provides them as part of the BiomPIN metadata. CYL-specific rendering and rare failure-time BiomAPI status fetching stay in [`js/biompin.js`](js/biompin.js) below the `HISTORY FUNCTIONS` banner.

---

## Privacy posture

CYL is a static client-side app. There is no backend, no analytics, no telemetry.

- The **only** outbound network traffic is to `biomapi-next.onrender.com` (PIN retrieve, file upload, status) and `web3forms.com` (contact form).
- Patient data pasted into the calculator never leaves the browser unless the user explicitly uploads a file to BiomAPI.
- Local history is stored in the browser's `localStorage` and is scoped to a single device / browser profile.
- There are no cookies, no tracking pixels, no session tokens.

If you're evaluating BiomAPI for clinical deployment, CYL is a useful reference for a privacy-by-construction integration.

---

## PWA, offline, iOS install

CYL is a progressive web app:

- [`manifest.json`](manifest.json) describes the installable app (name, icons, theme color).
- [`sw.js`](sw.js) precaches all core assets on install, cleans up old caches on activate (keyed by `CACHE_VERSION`), and serves cache-first for statics with a network-first fallback for navigation.
- Safe-area insets in [`styles.css`](styles.css) ensure the header extends under the iOS status bar when installed.

**iOS install:** open the live site in Safari → Share → *Add to Home Screen*. The app then launches full-screen with the CYL icon.

**Cache invalidation:** every asset URL in `index.html` carries a `?v=X.Y.Z` query string so browsers and proxies refetch on version bumps. See [Version bumping protocol](#version-bumping-protocol).

---

## Repository layout

```
.
├── index.html              — single-page app markup
├── styles.css              — custom CSS: animations, print layout, disclaimer, JSON mode
├── sw.js                   — service worker (precache + cache-first fetch)
├── manifest.json           — PWA manifest
├── CNAME                   — GitHub Pages domain (cyl.mraimundo.com)
├── AGENTS.md               — instructions for coding agents
├── package.json            — Tailwind build script, no runtime deps
├── css/
│   ├── tailwind.input.css  — Tailwind source
│   └── tailwind.css        — compiled, minified output
├── icons/                  — PWA icons (192, 512, apple-touch, favicon)
└── js/
    ├── main.js             — entry point: imports, event wiring, boot
    ├── ui.js               — shared state + DOM element cache + UI helpers + JSON view
    ├── biompin.js          — BiomAPI integration: retrieve, upload, paste, history UI
    ├── biompin-history.js  — standalone local history SDK
    ├── calculations.js     — ΔK, ΔTK (Liou-Brennan), ΔSO (Savini), ΔAK (Abulafia-Koch)
    ├── print.js            — print report layout + trigger
    └── contact.js          — contact modal + Web3Forms submission
```

No bundler, no framework, no transpiler — every file is served as-is. ES modules via native `<script type="module">`. Tailwind is the only build step.

---

## Local development

Requirements: Node 18+ (for Tailwind), any static HTTP server (Python 3 is fine).

```bash
# one-time
npm install

# build Tailwind (re-run after editing markup or tailwind.input.css)
npx tailwindcss -i css/tailwind.input.css -o css/tailwind.css --minify

# serve
python3 -m http.server 8000
# then open http://localhost:8000
```

There is no test suite. Changes are verified by hand: load a known PIN, upload a known printout, toggle JSON view, print, test the PWA offline behavior in DevTools.

---

## Version bumping protocol

CYL's cache-busting is manual. When releasing a new version **X.Y.Z**, update in a single commit:

**`index.html`**
- Every `?v=` query param on `<link>` and `<script>` tags.
- The footer version text (`CYL · X.Y.Z · ...`).

**`sw.js`**
- `const CACHE_VERSION = 'X.Y.Z';`  — this triggers a new cache generation on activate, and the old one is evicted.

Semver-ish: patch bumps for fixes, minor for user-visible features (including new UI modes like JSON view), major would require a structural breaking change (no major releases yet).

---

## Disclaimer

CYL is a **technology preview**. It is:

- **Not** a registered medical device.
- **Not** cleared by any regulatory body (CE, FDA, etc.).
- **Not** a substitute for the biometer's own report or surgeon judgement.

The values BiomAPI extracts from printouts and the calculations CYL runs on them may contain errors. **Always double-check every value** (K1/K2 magnitudes, axes, PK if applicable) against the source printout before acting on any computed delta. If in doubt, enter the values manually from the original biometer report.

---

## Contributing & license

Issues and pull requests are welcome at [github.com/mglraimundo/cyl](https://github.com/mglraimundo/cyl).

Scope: keep the app small, fast, and dependency-free. New features should preserve the privacy-by-default posture (no backend, no telemetry). Clinical features should cite a peer-reviewed source.

Developed by Miguel Raimundo. Contact via the in-app modal (footer → *Developed by Miguel Raimundo*).
