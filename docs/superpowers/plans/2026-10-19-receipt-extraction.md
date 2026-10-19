# Receipt Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add browser-local receipt extraction that produces one editable expense row per receipt and exports single receipts or batches to Excel and CSV.

**Architecture:** Reuse the existing upload, OCR, result, review, and export flows. Add receipt-aware parsing after the bank-statement parser, render receipt-specific summary and review fields, and add consolidated receipt export functions. Keep each original file and its extracted text in the browser.

**Tech Stack:** React, TypeScript, Vite, Tesseract.js, pdf.js, ExcelJS.

## Global Constraints

- Reuse the existing browser OCR and document input pipeline; do not upload receipt files or text to a server.
- Keep receipt filenames, OCR text, and extracted fields out of optional remote assistant requests. Hide or disable remote assistant support while a receipt is active.
- Use explicit receipt labels for date, tax/VAT/GST/SST, subtotal, and total where possible. Prefer an explicit grand total or amount paid over subtotal. Never manufacture a missing total.
- Preserve bank-statement parsing, balance validation, and current export behavior.
- Receipt XLSX/CSV rows include Date, Merchant, Total, Tax, Currency, Currency Status, Category, Confidence, and Source. Leave missing extracted values blank; use Currency Status `Confirmed` or `Needs review` so an empty currency is clear.
- Existing action-only analytics may continue to record upload, conversion, and export actions; receipt contents, filenames, and extracted values must not be added to analytics.
- Handle one receipt per file. Product line items and multiple receipts inside one file are out of scope.
- Do not add or run automated tests for this task. Use the production build as the compile check.

---

### Task 1: Receipt-aware parsing and currency provenance

**Files:**
- Modify: `src/lib/converter.ts`

**Interfaces:**
- Keep `ExtractedRow` compatible with current exports: `description` holds the merchant, `amount` holds the receipt total, `tax` holds an explicitly labeled tax amount, `date` holds the receipt date, `category` holds a conservative suggestion or `Uncategorized`, and `source` identifies the OCR/text line.
- Add optional `ConversionResult.currencyCodeDetected?: boolean`. `currencyCode` can retain its existing formatting fallback, but receipt exports show a currency only when this flag is true.
- Keep `parseRawText(rawText, fileName, fileType, fileMeta)` as the parser entry point. Statement-table parsing takes priority over receipt detection.

- [x] **Step 1: Track explicit currency evidence.** Change the private currency detector to return `{ code: string; detected: boolean }`. Preserve the existing code choice and USD fallback for current bank-statement displays. Set `currencyCodeDetected` only when the text or filename has an explicit supported currency signal.
- [x] **Step 2: Add conservative receipt detection.** Add a private `looksLikeReceipt(lines: string[], fileName: string)` helper. Recognize explicit receipt labels such as subtotal, tax/VAT/GST/SST, total paid, merchant, or POS wording. Return false when statement headers or a running-balance pattern identify a bank statement.
- [x] **Step 3: Extract one receipt row.** Add a private `parseReceipt(lines: string[], fileName: string, currencyCode: string, currencyCodeDetected: boolean): ExtractedRow`. Prefer an explicit date and merchant text; choose an explicitly labeled grand total/amount paid/total over subtotal; capture only explicitly labeled tax values; suggest a category only from clear keywords and otherwise use `Uncategorized`. Leave unreadable fields undefined, set source and confidence, and lower confidence when date, merchant, total, or currency is missing.
- [x] **Step 4: Route receipt text without changing statement results.** In `parseRawText`, keep `parseStatementTable` first. If it returns no statement rows and `looksLikeReceipt` is true, use exactly one result row from `parseReceipt`; otherwise keep the existing generic row and fallback behavior. Set `summary.documentKind` to `Receipt`, `summary.vendor` to the extracted merchant when present, and `summary.total` to the receipt total when present. Keep receipt validation free of balance-trail errors.
- [x] **Step 5: Preserve review-pack round trips.** Include `currencyCodeDetected` when serializing receipt results and restore it on import. Continue accepting existing review JSON that has no such property.
- [x] **Step 6: Commit the parser change.** Commit the changes in `src/lib/converter.ts` as `feat: extract receipt expense fields`.

### Task 2: Receipt review and local source preview

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`

**Interfaces:**
- Branch receipt presentation on `activeResult.summary.documentKind === 'Receipt'`.
- Extend `updateRow` to edit the existing `date`, `description`, `amount`, and `tax` properties plus `category`.
- Keep all bank-statement labels, balance validation, PDF source preview, and edit behavior unchanged.

- [x] **Step 1: Add receipt summary cards.** For receipt results show merchant, date, total, tax, currency, and category. Do not show statement period or balance-check copy. If `currencyCodeDetected` is false, display “Confirm currency” rather than the USD fallback.
- [x] **Step 2: Add an editable currency control.** When currency is undetected, show an empty selector with a clear “Confirm currency” label. Offer USD, MYR, SGD, EUR, GBP, JPY, AUD, and CAD; selecting one sets `activeResult.currencyCode` and `currencyCodeDetected: true`. Let the user clear the selection to return to an unconfirmed state.
- [x] **Step 3: Add a receipt review table.** For receipt results render Date, Merchant, Total, Tax, Currency, Category, and Review columns. Wire Edit values inputs to `updateRow`; updating a receipt row must update the displayed summary merchant and total and must not run a bank balance check.
- [x] **Step 4: Show missing-field review states.** Mark missing or low-confidence receipt fields for review. Keep values blank when OCR did not find them; do not fill a default tax, merchant, total, or currency.
- [x] **Step 5: Add local image preview.** Reuse the existing source-file identity/cache path to retain image receipt files in memory and create an object URL only for the active receipt. Render the image next to the receipt table with the source filename as accessible text. Revoke object URLs when the active source changes or the component unmounts. Continue using the current PDF preview for receipt PDFs.
- [x] **Step 6: Keep the receipt layout usable on narrow screens.** Add receipt-specific responsive table or card styling in `src/App.css`, preserving visible field names and keyboard focus states.
- [x] **Step 7: Keep receipt details out of remote assistant requests.** For receipt results, hide or disable the remote assistant support UI, return no receipt-derived `agentContext`, and guard `askAgent` so it cannot POST receipt filenames, OCR text, or extracted fields to `/api/agent/`. Keep the statement assistant behavior unchanged.
- [x] **Step 8: Commit the review change.** Commit the changes in `src/App.tsx` and `src/App.css` as `feat: review extracted receipts`.

### Task 3: Single and batch receipt exports

**Files:**
- Modify: `src/lib/converter.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Keep `createExcelBlob(result: ConversionResult)`, `createCsvBlob(result: ConversionResult)`, and `createCombinedExcelBlob(results: ConversionResult[])` callable with their current signatures.
- Add `createReceiptBatchCsvBlob(results: ConversionResult[]): Blob`, filtering receipt results and writing one row per receipt.
- `createCombinedExcelBlob` adds one consolidated `Receipts` sheet when a batch contains receipts, while preserving existing per-file sheets and the Issues sheet.

- [ ] **Step 1: Format a single receipt export.** When `result.summary.documentKind === 'Receipt'`, make the Excel Rows sheet and CSV columns Date, Merchant, Total, Tax, Currency, Currency Status, Category, Confidence, and Source. Leave Currency blank when `currencyCodeDetected` is false; set Currency Status to `Needs review` when false and `Confirmed` when true. Leave missing extracted values blank. Keep bank-statement sheet/CSV columns unchanged.
- [ ] **Step 2: Add the consolidated receipt worksheet.** In `createCombinedExcelBlob`, add a `Receipts` sheet containing all receipt results in the batch with the same fields plus source filename. Use safe sheet-name handling already present in the workbook helper.
- [ ] **Step 3: Add batch CSV export.** Implement `createReceiptBatchCsvBlob` with one row per receipt and proper CSV quoting. Include source filename and the Currency Status column (`Confirmed` or `Needs review`).
- [ ] **Step 4: Wire receipt export actions.** In `App.tsx`, show “All receipts XLSX” and “All receipts CSV” actions when the current batch contains receipt results. Name downloads `extractmint-receipts-YYYYMMDD.xlsx` and `extractmint-receipts-YYYYMMDD.csv`. Keep individual export buttons and all existing statement exports working as they do now.
- [ ] **Step 5: Commit the export change.** Commit changes in `src/lib/converter.ts` and `src/App.tsx` as `feat: export receipt batches`.

### Task 4: Compile check and requirement review

**Files:**
- No additional files expected beyond the tasks above.

- [ ] **Step 1: Run the production compile.** Run `npm run build` from the project root. Expected: exit code 0; existing Vite chunk-size warning may remain.
- [ ] **Step 2: Check the final diff.** Run `git diff --check` and review the diff against `docs/superpowers/specs/2026-10-19-receipt-extraction-design.md`. Confirm statement parsing and exports have no unrelated changes, and analytics carry no receipt fields, filenames, or contents.
- [ ] **Step 3: Record the review.** Update `.superpowers/sdd/progress.md` with completed task commits and review outcomes.
