# ExtractMint evidence-led sample demo and guide implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let visitors run an invented statement PDF through ExtractMint's real browser converter and consolidate unvalidated bank pages into one evidence-led guide.

**Architecture:** Extract the existing synthetic PDF renderer into a shared benchmark helper, generate one static sample PDF from the English fixture, and load it into the existing `processFiles` path from a separate sample action. Add sample-only analytics and expand the existing canonical statement guide. Redirect the three unsupported bank-specific URLs to an anchored limitations section and synchronize sitemap, `llms.txt`, and SEO assertions.

**Tech Stack:** Existing React 19, TypeScript, Vite, Node.js scripts, jsPDF, Vercel Analytics, current Node assertion-based SEO checks.

## Global Constraints

- Use only invented data from `benchmarks/statements/fixtures.mjs`; never use customer or uploaded statements.
- Label the sample and every sample output as synthetic; do not claim real-bank coverage, OCR quality, or production accuracy from it.
- Keep user uploads on the existing browser-side conversion path and preserve current upload, export, privacy, and accessibility behavior.
- Track sample actions with separate event names and no properties; do not count the demo as an actual user upload or conversion.
- Add no dependencies.
- Keep current unrelated uncommitted design, SEO, analytics, and benchmark work intact.

---

### Task 1: Share the benchmark PDF renderer and generate the public sample

**Files:**
- Create: `benchmarks/statements/pdf-generator.mjs`
- Create: `scripts/generate-synthetic-sample.mjs`
- Create: `public/samples/synthetic-bank-statement.pdf`
- Modify: `scripts/benchmark-statements.mjs`
- Modify: `package.json`
- Modify: `tests/seo-artifacts.test.mjs`
- Create: `tests/synthetic-sample.test.mjs`

**Interfaces:**
- `createStatementPdf(statementCase)` returns a `Uint8Array` containing a generated digital PDF.
- `npm run sample:statement` writes the English synthetic fixture to `public/samples/synthetic-bank-statement.pdf`.

- [ ] Write `tests/synthetic-sample.test.mjs` first. Assert the sample generator writes a file beginning with `%PDF-`, and that the generated PDF contains the synthetic title text when decoded as Latin-1. Run `node --test tests/synthetic-sample.test.mjs` and confirm it fails because the generator/helper do not exist yet.
- [ ] Move the current `pdfBytesFor` renderer from `scripts/benchmark-statements.mjs` into `benchmarks/statements/pdf-generator.mjs` as the named export `createStatementPdf` without changing column positions or fixture layout.
- [ ] Import the shared renderer in the benchmark script and replace its local generator calls.
- [ ] Create `scripts/generate-synthetic-sample.mjs` to select `synthetic-english-ledger`, call `createStatementPdf`, create `public/samples/` if missing, and write the bytes to the fixed output path.
- [ ] Add the `sample:statement` package script.
- [ ] Extend `tests/seo-artifacts.test.mjs` to assert the `sample:statement` script is defined.
- [ ] Run `npm run sample:statement`, `node --test tests/synthetic-sample.test.mjs`, the focused SEO check, and `npm run benchmark:statements`; confirm the fixture still passes through the real converter.

### Task 2: Run the sample through the live browser converter

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/lib/analytics.ts`
- Modify: `tests/seo-artifacts.test.mjs`
- Create: `tests/synthetic-sample-loader.test.mjs`
- Modify: `src/App.css`

**Interfaces:**
- Change `processFiles(fileList)` to `processFiles(fileList, source = 'upload')`, where `source` is `'upload' | 'sample'`.
- Sample mode disables forced OCR for the known digital fixture while preserving all other user-selected processing settings.
- Add `loadSyntheticSample(): Promise<void>` for fetching and converting the static asset.

- [ ] Add `tests/synthetic-sample-loader.test.mjs` for `fetchSyntheticSample`, covering a successful `application/pdf` response and a 404 response. Run it and confirm the tests fail because the loader does not yet exist.
- [ ] Create `src/lib/syntheticSample.ts` with the fixed sample URL and filename plus `fetchSyntheticSample(fetcher = fetch)`, which rejects non-OK responses and returns the PDF `Blob`.
- [ ] Extend the analytics event union with `sample_conversion_started`, `sample_conversion_completed`, and `sample_conversion_failed`.
- [ ] Update `processFiles` so normal input keeps `upload_started` and `conversion_completed`; sample mode emits only the sample event names and uses `forceOcr: false` for this text-PDF fixture.
- [ ] Add `loadSyntheticSample` with an in-flight guard, `fetch('/samples/synthetic-bank-statement.pdf')`, an HTTP status check, conversion through `processFiles([sampleFile], 'sample')`, and a visible error in the existing progress state if fetch fails.
- [ ] Add an accessible button and download link near the upload control. Label the action as a synthetic example, explain that it uses invented figures and runs in the browser, and disable the button during conversion.
- [ ] Add focused styles that keep the sample action secondary to the primary upload action and readable at mobile widths.
- [ ] Update the SEO artifact assertions for the sample label, synthetic notice, download path, and separate analytics event names.
- [ ] Run the focused checks, then use the browser to confirm the button produces the parsed English fixture and ordinary upload events remain unchanged.

### Task 3: Expand the primary guide and consolidate unvalidated bank pages

**Files:**
- Modify: `public/convert/bank-statement-to-excel/index.html`
- Modify: `public/convert/bank-statement-to-excel/index.md`
- Modify: `vercel.json`
- Modify: `public/sitemap.xml`
- Modify: `public/llms.txt`
- Modify: `public/index.md`
- Modify: `index.html`
- Modify: `tests/seo-artifacts.test.mjs`

**Interfaces:**
- Canonical guide: `/convert/bank-statement-to-excel/`.
- Redirects: `/convert/cimb-bank-statement-to-excel/`, `/convert/maybank-bank-statement-to-excel/`, and `/convert/singapore-bank-statement-to-excel/` go permanently to `/convert/bank-statement-to-excel/#bank-format-limitations`.

- [ ] Update `tests/seo-artifacts.test.mjs` first to expect the consolidated sitemap, all three permanent redirects, the guide's synthetic sample/review details, and no homepage `SearchAction`. Run `npm run test:seo` and confirm the new assertions fail against the current artifacts.
- [ ] Add a visible “Try a synthetic example” CTA, synthetic transaction table, balance equation, review checklist, output list, privacy data-flow link, and a clearly bounded benchmark note to both guide representations.
- [ ] Add the `id="bank-format-limitations"` section explaining that no bank-specific format has been independently validated and that users should check statement content against each export.
- [ ] Add the three permanent redirects to `vercel.json` and verify they do not shadow the legacy-host redirects or general headers.
- [ ] Remove the redirected pages from `public/sitemap.xml`, `public/llms.txt`, and `public/index.md`; retain PDF and scanned-statement guide routes.
- [ ] Remove the inaccurate root `SearchAction` structured-data node from `index.html` while keeping the `WebSite`, `Organization`, `SoftwareApplication`, and `FAQPage` descriptions aligned with the current product.
- [ ] Run `npm run test:seo`, `npm run test:agent`, `npm run benchmark:statements`, `npm run build`, and `npm run lint`.

### Task 4: Production verification and deployment

**Files:**
- No source changes unless verification exposes a defect.

- [ ] Inspect the generated PDF and rendered sample conversion in the local browser.
- [ ] Confirm the primary guide, sitemap, `llms.txt`, and three redirects against the local production build.
- [ ] Deploy the verified build to the existing Vercel production project and confirm `READY`.
- [ ] Verify the live sample asset, guide, redirects, canonical tag, and sitemap responses.
- [ ] Report the Google recrawl request as queued, not as an indexing or ranking result.
