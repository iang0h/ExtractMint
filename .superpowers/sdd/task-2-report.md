# Task 2 report: synthetic sample in the browser converter

## Implementation

- Added `fetchSyntheticSample()` with a fixed public PDF URL and filename. It returns the response blob and reports a non-OK HTTP status as an error. Type declarations keep the JavaScript loader usable from the TypeScript app.
- Added a secondary, keyboard-accessible sample button and PDF download link below the upload dropzone. The copy identifies the invented figures and browser processing. The button has stable ID `load-synthetic-sample` and is disabled while the sample loads or conversion runs.
- Routed the downloaded PDF through the existing `processFiles` and `converter.convertFiles` path. Sample runs override `forceOcr` to `false` without changing the selected checkbox or stored preference; OCR language and cache settings remain as selected.
- Added separate sample started, completed, and failed analytics events. The sample produces no `upload_started` or `conversion_completed` event and does not enter the local conversion telemetry list. Ordinary upload and export event calls remain in place. All analytics calls carry only an event name.
- Made fetch and converter loader errors visible in the existing live progress panel. Updated both privacy-page versions to describe the three property-free demo events.
- Added responsive styling and corrected contrast for the sample heading and progress filename after visual review.

## TDD and checks

1. Added the successful PDF and HTTP 404 loader tests before the loader. `node --test tests/synthetic-sample-loader.test.mjs` failed with `ERR_MODULE_NOT_FOUND` for the missing loader (expected red). After implementation, both tests passed.
2. Added SEO artifact assertions for the sample CTA ID, wording, download path, analytics event names, and privacy copy before implementation. The SEO test failed on the absent sample CTA (expected red), then passed after implementation.
3. Final focused checks: loader tests 2/2 passed; `node tests/seo-artifacts.test.mjs` passed; `npm run lint` passed; `npm run build` passed; `git diff --check` passed. Vite reported its existing large-chunk advisory, with no build failure.

## Browser exercise

- Opened the local Vite app and confirmed the sample button and PDF download link were present in the converter card.
- Enabled the Force OCR checkbox, clicked **Load synthetic example**, and observed the button disable and the progress panel move through reading to complete.
- The live converter produced five rows from `synthetic-bank-statement.pdf`, including the invented Studio supplies, Project credit, and Service charge transactions. It reported a verified balance trail with three matched transitions and a $0.00 discrepancy.
- Confirmed Force OCR remained checked after conversion, the download link pointed to `/samples/synthetic-bank-statement.pdf`, and visual text contrast was readable after the CSS fix.

## Self-review and limits

- Inspected the diff for event separation, the in-flight guard, loader error handling, OCR override, progress visibility, and untouched upload/export analytics calls.
- The browser development build does not send Vercel analytics (`trackExtractMintEvent` sends only in production), so event transmission was reviewed in source rather than observed over the network. The loader's 404 path was covered by the focused test; the browser exercise used the successful fixture path.
