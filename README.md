# ExtractMint

Web app: [ExtractMint](https://extractmint.iangoh.com/)

Elegant static SaaS prototype for converting bank statements, receipts, scans, PDFs, DOCX files, spreadsheets, CSV, and text into cleaner business files.

## What is included

- Animated React/Vite landing app and conversion workspace.
- Client-side extraction for PDFs, images via OCR, DOCX, XLSX/XLS, CSV, and TXT.
- Export buttons for Excel `.xlsx`, Google Docs-ready `.docx`, `.pdf`, `.csv`, and QuickBooks-ready `.qbo` (OFX).
- Accountant-oriented exports:
  - Per-file review JSON (`*.extractmint-review.json`) with validation flags and SHA-256 fingerprint.
  - Review pack ZIP export with one `.xlsx` + review JSON per uploaded file (and ZIP import by uploading the pack back into the app).
  - Combined workbook export (`Combined XLSX`) that puts each file into its own worksheet plus a shared Issues sheet.
- Excel exports keep money columns as real numbers (not text) so sums/pivots work.
- In-app review table with inline edits that immediately re-check the running balance trail.
- Ask ExtractMint agent panel for conversion questions, review guidance, export choices, and balance-check next steps.
- Optional FreeLLMAPI-backed answers through a Vercel API route, with a built-in local fallback when the gateway is not configured.
- Remotion composition for a product explainer.
- Remotion vertical onboarding promo for launch and social posts.
- HyperFrames-ready HTML sources for a website-to-video walkthrough and onboarding promo.
- Vercel deployment config and fallback static-hosting notes.

## Local commands

```bash
npm install
npm run dev
npm run build
npm run benchmark:statements
npm run test:agent
npm run preview
npm run deploy:vercel
```

## Desktop preview

ExtractMint also has a local-first desktop preview for macOS and Windows. It
uses the existing bank-statement conversion, review, and export flow, plus
receipt-level extraction that exports one row per receipt (such as date,
merchant, total, tax, currency, and category when detected). It does not
extract individual receipt line items.

### Developer prerequisites

- Node.js 24 and npm.
- The stable Rust toolchain, including Cargo.
- macOS: Xcode Command Line Tools.
- Windows: Microsoft C++ Build Tools with the MSVC toolchain, and WebView2.

### Run or build the desktop app

Install the JavaScript dependencies, then start the app in desktop development
mode:

```bash
npm ci
npm run desktop:dev
```

Build just the desktop-mode frontend bundle with:

```bash
npm run build:desktop
```

Package the app for the current platform with:

```bash
npm run desktop:build
```

The desktop packaging command uses the platform target configured for the
machine running it: a DMG on macOS and an NSIS setup executable on Windows.

### Privacy and OCR assets

Desktop builds disable Vercel Analytics and the remote ExtractMint assistant.
Bank statements and receipts are processed on the device; source document
bytes, extracted text, and PDF passwords stay on the device. When OCR is
needed, Tesseract may separately download its worker and language data. These
are OCR engine assets, not uploads of the user's documents, and an internet
connection may be needed to obtain assets that are not already available.

### Unsigned CI previews and public distribution

The **Desktop preview builds** workflow can be started manually in GitHub
Actions or by pushing a `desktop-v*` tag. It produces unsigned preview
artifacts: a macOS DMG and app bundle, and a Windows NSIS setup executable.
Download them from the completed workflow run's artifacts. CI artifacts are
temporary previews, not signed public installers.

Public macOS distribution requires Developer ID signing and Apple
notarization. Public Windows distribution requires a trusted signing route or
distribution through the Microsoft Store. Signing credentials, notarization,
and commercial installer setup are not configured by this pilot.

This pilot does not include firm or client accounts, cloud sync,
billing/licensing, accounting software integrations, or receipt line-item
extraction.

## Statement extraction benchmark

Run the offline statement benchmark with:

```bash
npm run benchmark:statements
```

It generates digital PDFs in memory from the invented fixtures in
`benchmarks/statements/fixtures.mjs` and sends them through the same
`convertFiles` path used by the app. No statement files are uploaded, and the
benchmark does not call an external service. To save a machine-readable report:

```bash
npm run benchmark:statements -- --json /tmp/extractmint-statement-report.json
```

The terminal and JSON reports identify this as synthetic data. Each fixture
reports expected and extracted transaction counts, one-to-one matched rows,
precision (matched rows divided by extracted rows), recall (matched rows
divided by expected rows), exact field rates, and the converter's balance
validation status. Field rates compare date, description, reference, amount,
withdrawal, deposit, tax, and balance with the labeled expected rows. The
overall rates pool counts across the included fixtures. A row, expected-field,
or balance mismatch makes the command exit with a non-zero status.

These results describe only the included synthetic text-PDF fixtures and the
specific layouts they exercise. They do not establish real-bank coverage,
scanned-PDF/OCR performance, or production accuracy, and should not be compared
to another converter as a general accuracy claim. Real-world measurements need
an authorized, consented, redacted corpus with labeled expected transactions.

## Ask ExtractMint agent

The app includes `/api/agent/`, a Vercel serverless route designed to work with
FreeLLMAPI (`tashfeenahmed/freellmapi`). The frontend never receives provider
keys.

## Optional support email CTA

If you set `VITE_SUPPORT_EMAIL`, the app shows an “Email support” button in the
Support panel (pre-filled template; users can attach the Diagnostic export and
optionally a redacted sample page ZIP).

Example:

```bash
VITE_SUPPORT_EMAIL=support@example.com
```

Default behavior:

- If no gateway is configured, the agent returns local review guidance.
- If FreeLLMAPI is configured, the route forwards to its OpenAI-compatible
  `/v1/chat/completions` endpoint.

Set these Vercel environment variables:

```bash
FREELLMAPI_BASE_URL=https://your-freellmapi-host.example.com/v1
FREELLMAPI_API_KEY=freellmapi-your-unified-key
FREELLMAPI_MODEL=auto
```

FreeLLMAPI itself is a separate Node server with provider-key storage. Run it on
a server you control, add your free-tier provider keys there, then point
ExtractMint at its `/v1` base URL.

## Vercel deployment

This repo is configured for Vercel as a static Vite app:

- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm ci`

Run:

```bash
npm run deploy:vercel
```

If the CLI asks you to authenticate, run `npx --yes vercel login` first, then rerun the deploy command.

## Video commands

```bash
npm run remotion:studio
npm run remotion:render
npm run remotion:onboarding
npm run hyperframes:source
npm run hyperframes:onboarding
```

The rendered onboarding video is written to `out/extractmint-onboarding.mp4`. The HyperFrames sources live at `hyperframes/extractmint-demo.html` and `hyperframes/extractmint-onboarding.html`.

## Static hosting fallback

Run:

```bash
npm run build
```

Upload the contents of `dist/` to any static host. This build is static and does not need a Node server.

For production-grade extraction of difficult scanned statements, add a server queue later for OCR, LLM validation, duplicate detection, authentication, billing, and audit logs.
