# ExtractMint

Elegant static SaaS prototype for converting bank statements, receipts, scans, PDFs, DOCX files, spreadsheets, CSV, and text into cleaner business files.

## What is included

- Animated React/Vite landing app and conversion workspace.
- Client-side extraction for PDFs, images via OCR, DOCX, XLSX/XLS, CSV, and TXT.
- Export buttons for Excel `.xlsx`, Google Docs-ready `.docx`, `.pdf`, generic `.csv`, Xero-ready bank statement `.csv`, and QuickBooks-ready `.qbo` (OFX).
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
npm run test:agent
npm run preview
npm run deploy:vercel
```

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
