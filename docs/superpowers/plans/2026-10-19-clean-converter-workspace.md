# Clean Converter Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the ExtractMint converter around upload, review, and downloading Excel while keeping every current conversion, export, settings, privacy, and support capability available.

**Architecture:** Keep the existing React `App` and its processing/export handlers. Change the initial and conditional rendering in `src/App.tsx`, then add a small set of converter-specific disclosure, result, and responsive styles in `src/App.css`; do not introduce new components or dependencies.

**Tech Stack:** React 19, TypeScript, Vite, plain CSS, native HTML `<details>` disclosures.

## Global Constraints

- Do not change extraction, OCR, password handling, review, batch processing, or export implementations.
- Do not remove or rename any supported export format or support capability.
- Do not change browser-local processing or introduce server-side file/password handling.
- Do not add dependencies or new analytics events for this visual simplification.
- Keep filenames and document-derived content out of analytics and support telemetry as currently specified.
- Do not redesign the homepage, navigation, marketing copy, or below-workspace sections.

---

## File map

- Modify `src/App.tsx` to remove the automatically seeded sample state, conditionally show progress/results, and reorganize the existing converter controls and actions. Existing conversion, export, support, and cache handlers remain the source of behavior.
- Modify `src/App.css` to style the primary result action, quiet sample/privacy notes, native disclosures, visible balance status, and narrow layouts. Reuse existing colors and typography.
- Do not create new components, dependencies, or test files for this information-hierarchy change.

### Task 1: Start with a true upload state

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: `activeResult` is `undefined` while no file or sample has been converted; existing handlers continue to populate `results` after conversion.
- Produces: the progress panel is visible during processing and for actionable failure/cancel messages, but not as a preloaded “ready” sample card.
- Produces: the converted workspace is rendered only when a result exists.

- [ ] **Step 1: Remove the startup sample result.** Delete the now-unused `createSampleResultLite` function and initialize the results list empty:

```tsx
const [results, setResults] = useState<ConversionResult[]>([])
```

Keep `loadSyntheticSample` unchanged; it remains the explicit way to load the synthetic example.

- [ ] **Step 2: Start progress in a neutral state.** Replace the sample filename/status initializer with:

```tsx
const [progress, setProgress] = useState<ProgressEvent>({
  fileName: '',
  stage: 'ready',
  percent: 0,
  detail: '',
})
```

- [ ] **Step 3: Derive whether progress deserves space.** Beside `activeResult`, add:

```tsx
const showProgressPanel =
  isProcessing || progress.stage === 'error' || progress.detail === 'Conversion canceled'
```

Place `{showProgressPanel && (` immediately before the existing `<div className="progress-panel">` and `)}` immediately after its matching closing `</div>`. Keep its `role="status"`, `aria-live="polite"`, progress text, and ring unchanged.

- [ ] **Step 4: Hide the empty converted workspace.** Change the section's opening to `{activeResult ? (<section className="results-section">` and replace its matching closing tag with `</section>) : null}`. Preserve the section contents and all row/PDF review controls for completed results.

- [ ] **Step 5: Review Task 1 behavior in the app.** Confirm a fresh load shows the upload action without a synthetic filename, progress ring, disabled exports, or empty review table. Confirm **Try a sample statement** and file upload still begin processing and produce results. Confirm the existing password request and error/cancel messages remain visible while no result exists.

**Expected result:** the first view has no implied conversion result, while upload and explicit sample processing retain their existing code paths.

### Task 2: Make upload, review, and Excel the primary path

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `activeResult`, `results`, `downloadBlob('xlsx')`, `downloadCombinedWorkbook`, existing format exporters, and existing settings/support handlers.
- Produces: one visible **Download Excel** action for the active result; all other format exports are reachable inside **More export formats**.

- [ ] **Step 1: Quiet the sample action and add a compact processing note.** Replace the current two-column sample card and explanatory paragraph with:

```tsx
<div className="synthetic-sample-action">
  <button
    id="load-synthetic-sample"
    type="button"
    onClick={() => void loadSyntheticSample()}
    disabled={isProcessing || isSampleLoading}
  >
    {isSampleLoading ? 'Loading sample…' : 'Try a sample statement'}
  </button>
  <a href={SYNTHETIC_SAMPLE_URL} download={SYNTHETIC_SAMPLE_FILENAME}>
    Download sample PDF
  </a>
</div>
<p className="local-processing-note">Conversion runs in your browser. Privacy and support details are available below.</p>
```

- [ ] **Step 2: Place technical settings in one collapsed disclosure.** Wrap the four existing controls—Force OCR, OCR language, persistent OCR cache, and persistent PDF review index—in:

```tsx
<details className="converter-disclosure">
  <summary>Advanced options</summary>
  <div className="converter-disclosure-body">
    <div className="ocr-settings">
      <label>
        <input
          type="checkbox"
          checked={forceOcr}
          onChange={(event) => {
            const next = event.target.checked
            setForceOcr(next)
            storeValue('extractmint.forceOcr', next ? '1' : '0')
          }}
        />
        Force OCR (scanned PDFs)
      </label>
      <label>
        OCR language
        <select
          value={ocrLanguage}
          onChange={(event) => {
            const next = event.target.value
            setOcrLanguage(next)
            storeValue('extractmint.ocrLanguage', next)
          }}
        >
          <option value="eng">English</option>
          <option value="msa">Malay</option>
          <option value="ind">Indonesian</option>
          <option value="chi_sim">Chinese (Simplified)</option>
        </select>
      </label>
      <label className="ocr-cache-row">
        <input
          type="checkbox"
          checked={persistOcrCache}
          onChange={(event) => {
            const next = event.target.checked
            setPersistOcrCache(next)
            storeValue('extractmint.persistOcrCache', next ? '1' : '0')
          }}
        />
        Persist OCR cache (faster repeat exports)
        {persistOcrCache ? (
          <span className="ocr-cache-meta">
            {ocrCacheStats.entries} saved · {Math.round(ocrCacheStats.bytes / 1024)} KB
            <button
              type="button"
              className="link-button"
              onClick={() => {
                void (async () => {
                  await clearPersistentOcrCache()
                  refreshOcrCacheStats()
                })()
              }}
            >
              Clear
            </button>
          </span>
        ) : null}
      </label>
      <label className="ocr-cache-row">
        <input
          type="checkbox"
          checked={persistPdfTextIndex}
          onChange={(event) => {
            const next = event.target.checked
            setPersistPdfTextIndex(next)
            storeValue('extractmint.persistPdfTextIndex', next ? '1' : '0')
          }}
        />
        Persist PDF review index (faster row matching)
        {persistPdfTextIndex ? (
          <span className="ocr-cache-meta">
            {pdfTextIndexStats.entries} pages saved · {Math.round(pdfTextIndexStats.bytes / 1024)} KB
            <button
              type="button"
              className="link-button"
              onClick={() => {
                void (async () => {
                  await clearPersistentPdfTextIndex()
                  refreshPdfTextIndexStats()
                })()
              }}
            >
              Clear
            </button>
          </span>
        ) : null}
      </label>
    </div>
  </div>
</details>
```

Move the settings disclosure below the result summary, balance status, and **More export formats** disclosure. Move the existing privacy and support detail bodies out of `.ocr-settings`; their combined disclosure follows **Advanced options**. Do not change their action handlers, cache behavior, telemetry contents, email behavior, or redaction component.

- [ ] **Step 3: Show a compact completed summary and primary export.** After actionable processing/password UI, render this only when `activeResult` exists:

```tsx
{activeResult && !isProcessing ? (
  <div className="result-primary-action">
    <div className="result-primary-summary">
      <span>Ready to review</span>
      <strong>{activeResult.fileName}</strong>
      <small>{activeResult.rows.length} rows extracted</small>
    </div>
    <button
      className="primary-export-button"
      type="button"
      onClick={() => void downloadBlob('xlsx')}
      disabled={!activeResult}
    >
      <FileSpreadsheet size={17} />
      Download Excel
    </button>
  </div>
) : null}
```

Keep the filename visible so users know which file the existing active-result exporter will download. Keep the active-file selection and multi-file behavior unchanged.

- [ ] **Step 4: Move secondary file outputs into a disclosure.** Place **More export formats** after the balance status. Replace the always-visible `.export-row` with this structure and retain the current handlers/disabled conditions shown:

```tsx
<details className="converter-disclosure more-export-options">
  <summary>More export formats</summary>
  <div className="converter-disclosure-body">
    <div className="export-row">
      <button type="button" onClick={() => void downloadCombinedWorkbook()} disabled={results.length < 2}>
        <Table2 size={16} />
        Combined XLSX
      </button>
      <button type="button" onClick={downloadReviewJson} disabled={!activeResult}>
        <ShieldCheck size={16} />
        Review JSON
      </button>
      <div className="review-pack-export">
        <button type="button" onClick={() => void downloadReviewPack()} disabled={results.length === 0}>
          <FileArchive size={16} />
          Review pack (ZIP)
        </button>
        <label className="review-pack-source-option" title="Include the original statement PDFs inside the review pack ZIP so PDF previews work when you import later (larger download).">
          <input
            type="checkbox"
            checked={includeSourcesInReviewPack}
            onChange={(event) => {
              const next = event.target.checked
              setIncludeSourcesInReviewPack(next)
              storeValue('extractmint.reviewPackIncludeSources', next ? '1' : '0')
            }}
          />
          Include source PDFs
        </label>
      </div>
      <button
        type="button"
        onClick={downloadDiagnostic}
        disabled={!activeResult}
        title="Downloads a privacy-safe diagnostic JSON (no transactions) to help support new bank formats."
      >
        <Tag size={16} />
        Diagnostic
      </button>
      <button type="button" onClick={() => void downloadBlob('docx')} disabled={!activeResult}>
        <FileText size={16} />
        Google Docs
      </button>
      <button type="button" onClick={() => void downloadBlob('pdf')} disabled={!activeResult}>
        <FileText size={16} />
        PDF
      </button>
      <button type="button" onClick={() => void downloadBlob('csv')} disabled={!activeResult}>
        <ArrowDownToLine size={16} />
        CSV
      </button>
      <button type="button" onClick={() => void downloadBlob('qbo')} disabled={!activeResult}>
        <ReceiptText size={16} />
        QuickBooks (QBO)
      </button>
    </div>
  </div>
</details>
```

Keep `copySupportRequest` available once inside **Privacy and support** rather than duplicating it in two places. Remove the old `Export files` heading because the disclosure summary replaces it.

- [ ] **Step 5: Keep balance warnings visible and details collapsible.** Keep the current `exportSanitySnapshot` and threshold logic (`0.02`). Place this section after the primary Excel action and before **More export formats**. Replace the existing status header and card wrapper with this native `<details>` structure, keeping the current seven metric cells inside `.export-sanity-grid`:

```tsx
<details
  className={`export-sanity-card ${status.className}`}
  open={status.className === 'is-review'}
>
  <summary className="export-sanity-header">
    <div>
      <strong>Check balances</strong>
      <small>Compares opening/closing balances to extracted transaction totals.</small>
    </div>
    <span className="export-sanity-status">{status.label}</span>
  </summary>
  <div className="export-sanity-grid">
    <div>
      <span>Opening balance</span>
      <strong>{formatAmount(snapshot.openingBalance, activeResult.currencyCode)}</strong>
    </div>
    <div>
      <span>Closing balance</span>
      <strong>{formatAmount(snapshot.closingBalance, activeResult.currencyCode)}</strong>
    </div>
    <div>
      <span>Net change</span>
      <strong>{formatAmount(snapshot.netChange, activeResult.currencyCode)}</strong>
    </div>
    <div>
      <span>Transaction net</span>
      <strong>{formatAmount(snapshot.transactionNet, activeResult.currencyCode)}</strong>
    </div>
    <div>
      <span>Total deposits</span>
      <strong>{formatAmount(snapshot.deposits, activeResult.currencyCode)}</strong>
    </div>
    <div>
      <span>Total withdrawals</span>
      <strong>{formatAmount(snapshot.withdrawals, activeResult.currencyCode)}</strong>
    </div>
    <div className="export-sanity-discrepancy">
      <span>Discrepancy</span>
      <strong>{formatAmount(snapshot.discrepancy, activeResult.currencyCode)}</strong>
    </div>
  </div>
</details>
```

Keep passing and insufficient-data summaries visible while their full metric grid starts collapsed.

- [ ] **Step 6: Combine privacy and support behind one reachable disclosure.** Place **Privacy and support** after **Advanced options**. Replace the two current `details.privacy-panel` summaries with one summary whose exact opening markup is `<details className="converter-disclosure privacy-panel" id="support"><summary>Privacy and support</summary>`. Place one `.privacy-panel-body` inside that disclosure. Move the first disclosure's privacy paragraph, four-item list, and **Clear all local caches** action into that body. Then move the second disclosure's support paragraph, privacy-safe support copy, optional email support, telemetry clearing/history, and redaction helper into the same body, under a visible **Support tools** heading. Remove the inner disclosure wrappers and repeated privacy-panel summaries. Preserve every handler. Do not add analytics events or new persistence.

- [ ] **Step 7: Review Task 2 behavior in the app.** Confirm the completed filename, extracted row count, and **Download Excel** sit immediately below processing status, without advanced controls pushing them down or requiring a disclosure. Confirm each secondary export, combined workbook, review-pack checkbox, OCR/cache setting, privacy action, and support action still invokes its existing handler. Confirm a balance discrepancy opens its detail panel by default and a passing/insufficient-data panel stays collapsed.

**Expected result:** a user can complete the main task without scanning a grid of export tools, while secondary actions remain available on demand.

### Task 3: Style disclosures and narrow-screen layout

**Files:**
- Modify: `src/App.css`

**Interfaces:**
- Consumes: `.converter-disclosure`, `.result-primary-action`, `.primary-export-button`, `.local-processing-note`, and the existing `.export-sanity` classes from Task 2.
- Produces: clear hierarchy at the screenshot’s narrow width and desktop width, with visible focus and no dense default export grid.

- [ ] **Step 1: Add one shared disclosure treatment.** Add these base styles near the existing `.privacy-panel` rules:

```css
.converter-disclosure {
  margin: 0 20px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #fff;
}

.converter-disclosure > summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 44px;
  padding: 10px 14px;
  color: var(--ink);
  font-size: 14px;
  font-weight: 650;
  cursor: pointer;
  list-style: none;
}

.converter-disclosure > summary::-webkit-details-marker {
  display: none;
}

.converter-disclosure > summary::after {
  content: '+';
  color: var(--muted);
  font-size: 18px;
  font-weight: 500;
}

.converter-disclosure[open] > summary::after {
  content: '−';
}

.converter-disclosure > summary:focus-visible {
  outline: 2px solid var(--mint-dark);
  outline-offset: 2px;
}

.converter-disclosure-body {
  padding: 0 14px 14px;
}

.converter-disclosure-body .ocr-settings {
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
}

.export-sanity-card > .export-sanity-header {
  list-style: none;
  cursor: pointer;
}

.export-sanity-card > .export-sanity-header::-webkit-details-marker {
  display: none;
}

.export-sanity-card > .export-sanity-header:focus-visible {
  outline: 2px solid var(--mint-dark);
  outline-offset: 2px;
}

.export-sanity-card > .export-sanity-header::after {
  content: '+';
  color: var(--muted);
  font-size: 18px;
}

.export-sanity-card[open] > .export-sanity-header::after {
  content: '−';
}

.privacy-panel-body section + section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}

.privacy-panel-body h4 {
  margin: 0 0 8px;
  font-size: 14px;
}
```

- [ ] **Step 2: Make the result action visually dominant without adding another card grid.** Append these styles after the final existing `.synthetic-sample-action` rules so the simpler sample treatment overrides the old sample card:

```css
.result-primary-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 0 20px 14px;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #fafaf8;
}

.result-primary-summary {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.result-primary-summary span,
.result-primary-summary small {
  color: var(--muted);
  font-size: 12px;
}

.result-primary-summary strong {
  overflow-wrap: anywhere;
  font-size: 14px;
}

.primary-export-button {
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 18px;
  border: 1px solid #171717;
  border-radius: 8px;
  background: #171717;
  color: #fff;
  font-weight: 700;
  white-space: nowrap;
}

.local-processing-note {
  margin: -4px 20px 16px;
  color: var(--muted);
  font-size: 12px;
}

.synthetic-sample-action {
  justify-content: flex-start;
  margin: 0 20px 8px;
  padding: 0;
  border: 0;
  background: transparent;
}

.synthetic-sample-action button,
.synthetic-sample-action a {
  padding: 0;
  border: 0;
  background: transparent;
  color: #4c5c55;
  font-size: 12px;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.synthetic-sample-action button:focus-visible,
.synthetic-sample-action a:focus-visible {
  outline: 2px solid var(--mint-dark);
  outline-offset: 3px;
}

.review-pack-export {
  display: grid;
  align-content: start;
  gap: 8px;
}

.review-pack-export > button {
  width: 100%;
}

.review-pack-source-option {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.35;
}

.review-pack-source-option input {
  flex: 0 0 auto;
  margin: 1px 0 0;
}
```

- [ ] **Step 3: Make the secondary export grid quiet and compact.** Keep the existing `.export-row` button styling, but remove its card-like outer border/background inside `.more-export-options` and set two columns by default:

```css
.more-export-options .export-row {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
}

.more-export-options .export-row button {
  min-height: 42px;
}
```

Keep button focus indicators and do not reduce button tap height below 42px. Remove the now-unused `.export-options` rules and `.synthetic-sample-controls` rules from `src/App.css` after confirming no remaining JSX uses those classes.

- [ ] **Step 4: Adapt disclosures and actions for mobile.** Add the following rules inside the existing `@media (max-width: 720px)` block, then add the smaller-screen rules inside a `@media (max-width: 520px)` block:

```css
@media (max-width: 720px) {
  .converter-disclosure,
  .result-primary-action {
    margin-right: 12px;
    margin-left: 12px;
  }
}

@media (max-width: 520px) {
  .more-export-options .export-row {
    grid-template-columns: 1fr;
  }

  .result-primary-action {
    align-items: stretch;
    flex-direction: column;
  }

  .primary-export-button {
    width: 100%;
  }

  .converter-disclosure > summary {
    min-height: 44px;
  }
}
```

Keep the upload target large enough for touch and retain the existing dropzone focus outline.

- [ ] **Step 5: Review Task 3 visually.** At a 390px viewport and around the screenshot’s 747px viewport, confirm the default state shows one clear upload surface, a quiet sample action, and collapsed controls. Confirm the completed state keeps the filename legible and the Excel button easy to reach without a wide export grid. At desktop width, confirm the disclosures align with the converter card and their keyboard focus outlines are visible.

**Expected result:** the converter keeps its existing warm-paper style while reducing the number of competing surfaces and remaining usable on narrow screens.

### Task 4: Finish with a complete flow review

**Files:**
- No new files.
- Review: `src/App.tsx` and `src/App.css`.

- [ ] **Step 1: Build the application.** Run:

```bash
npm run build
```

Expected: TypeScript and Vite finish successfully and the existing homepage prerender step completes.

- [ ] **Step 2: Walk through the existing UI states in a browser.** Check a fresh load, explicit sample load, uploaded result, multi-file result, processing, protected-PDF password prompt, conversion error, and canceled conversion. Confirm all prior functions remain reachable and their labels make the next action clear.

- [ ] **Step 3: Inspect the three balance outcomes.** Confirm “Matches balance trail” and “Not enough balance data” are visible in the collapsed summary, and “Discrepancy — review” opens the detail panel automatically with the metrics visible.

## Self-review

- **Spec coverage:** Task 1 covers the clean first-load state and preserves sample, progress, error, cancellation, and password states. Task 2 covers the primary Excel action, secondary exports, all advanced settings, review-pack source inclusion, privacy/support actions, and visible discrepancy warnings. Task 3 covers the screenshot-width layout, desktop layout, and keyboard disclosure focus. Task 4 covers the production build and the complete user journey.
- **Placeholder scan:** No TODO, TBD, “implement later,” or unspecified handler names are used. Existing exporter and support handlers are named from `src/App.tsx`.
- **Type consistency:** No new TypeScript functions or types are introduced. `activeResult` remains `ConversionResult | undefined`; existing event handlers and exporter signatures are unchanged.
