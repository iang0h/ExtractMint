# ExtractMint receipt extraction design

## Goal

Add a receipt-aware path to the existing browser-based extraction workflow so a user can upload receipt images or PDFs, review one structured expense row per receipt, and export a batch to Excel or CSV.

## Current context

ExtractMint already accepts image files and PDFs and can run OCR in the browser. The current parser is tuned mainly for bank-statement rows. It can sometimes find dates and totals on receipts, but it does not consistently identify receipt merchants, tax, currency, and category as separate fields. The review table is editable, and the workbook/CSV exporters already support dates, amounts, tax, category, confidence, and source references.

## User flow

1. The user uploads one or more receipt photos or PDFs in the existing converter.
2. ExtractMint reads text locally in the browser and classifies each input as a receipt when its content has receipt signals such as subtotal, tax, total, merchant, or point-of-sale wording. Existing bank-statement detection remains the higher-priority path when statement columns or balance patterns are present.
3. The receipt result contains one row per receipt: date, merchant, total, optional tax, currency, category, confidence, and source. The first release handles one receipt per file; product line items and multiple receipts inside one file are out of scope.
4. The user reviews and can correct the date, merchant, total, tax, currency, and category in the existing review workspace. Missing or ambiguous values stay blank and are visibly marked for review rather than guessed.
5. The user exports the selected receipt or a multi-receipt batch to Excel or CSV. Batch exports use one consolidated receipt table with one row per source receipt and retain each source filename for the user's own bookkeeping.

## Review interface

Receipt results use receipt-specific labels and summary information. Show date, merchant, total, tax, currency, and category; omit statement-period and balance-trail language for receipts. Reuse the current PDF preview and provide a local image preview for receipt photos so users can check extracted values against the source. Low-confidence and missing fields must be easy to spot and edit before export.

Currency may use a detected code when the text provides a clear signal. The current USD fallback is not evidence of currency; if a receipt has no reliable signal, show it as needing review, leave the exported currency blank, and let the user select a currency before export. Category may use a conservative suggestion, but remains editable and should be marked for review when uncertain.

## Extraction and export boundaries

- Reuse the existing browser OCR and document input pipeline; do not upload receipt files or text to a server.
- Keep receipt filenames, OCR text, and extracted fields out of optional remote assistant requests. Hide or disable remote assistant support while a receipt is active.
- Use explicit receipt labels for date, tax/VAT/GST/SST, subtotal, and total where possible. Prefer an explicit grand total or amount paid over subtotal. Never manufacture a missing total.
- Preserve bank-statement parsing, balance validation, and current export behavior.
- Receipt XLSX/CSV rows include Date, Merchant, Total, Tax, Currency, Category, Confidence, and Source.
- Existing action-only analytics may continue to record upload, conversion, and export actions; receipt contents, filenames, and extracted values must not be added to analytics.

## Out of scope

- Item-by-item product extraction.
- Mobile camera capture, email ingestion, invoice fetching, accounting integrations, approvals, or cloud storage.
- Accounts, subscriptions, payment processing, or paid feature gates.
- Tax advice, automatic reimbursement, and claims of Dext feature or accuracy parity.

## Success criteria

- Typical receipt photos and PDFs produce one reviewable row with the fields that can be read reliably.
- Ambiguous or missing fields are left for the user to correct, not silently guessed.
- Single and batch receipt exports preserve the receipt fields and do not include statement balance checks.
- Existing bank-statement extraction and exports keep their current behavior.
- Receipt contents remain in the browser and are absent from analytics.
