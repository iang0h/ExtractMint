# Convert a PDF Bank Statement to Excel

ExtractMint reads text from PDF statement pages and turns likely transaction rows into a reviewable table. This guide focuses on digital PDFs with selectable text. Check the extracted dates, descriptions, debit and credit amounts, and balances against the original before using an export.

## Is the PDF text-based?

Open the file and try to select or copy a transaction description. If you can select the text, the PDF usually contains embedded text and is a good fit for direct text extraction. A PDF made from page images is a scan; see the [scanned bank statement guide](https://extractmint.iangoh.com/convert/scanned-bank-statement-to-excel/).

ExtractMint first reads text from PDF pages. If it finds very little embedded text, it may try browser OCR automatically. OCR results depend on scan quality, so review scanned files carefully even when the OCR step finishes.

## How conversion works

1. Upload a PDF from the [ExtractMint converter](https://extractmint.iangoh.com/#converter). Your browser reads its pages and shows progress.
2. ExtractMint looks for transaction dates, descriptions, references, amounts, withdrawals, deposits, and balances. Unusual layouts can leave fields missing or misplaced.
3. Review the rows, any review flags, and the balance checks.
4. Export the reviewed data in a format that fits your workflow.

## What to review

- Confirm the account and statement period, then compare the first and last transaction dates with the PDF.
- Check descriptions and references, including rows that wrap across lines or continue on another page.
- Verify amount signs and whether each transaction is a debit or credit. Date order can be ambiguous across regional formats.
- Compare opening and closing balances and spot-check running balance changes against the transactions.
- Resolve review flags and reconcile totals with the source before importing or sharing the output.

A matching balance trail is a useful consistency check; it does not prove every transaction was extracted correctly.

## Available exports

- **Excel XLSX** — workbook with detected transaction rows plus summary and reconciliation information.
- **CSV** — transaction fields in a portable table.
- **DOCX** — a document that can be opened in Google Docs.
- **PDF** — a summary of the converted rows.
- **QBO** — a QuickBooks-ready file; check compatibility with your accounting workflow before importing.
- **Review JSON** — saves extracted row and validation details for later review.
- **Review-pack ZIP** — can include source PDFs when that option is enabled. Treat the ZIP as a financial document.
- **Combined XLSX** — available when multiple files have been converted.

## Format support and accuracy

ExtractMint uses general text and row extraction. No bank-specific format has been independently validated against real statements. Column order, date notation, wrapped descriptions, currency conventions, and PDF text encoding vary, so an unfamiliar format may produce incomplete or incorrect fields.

Confidence values and balance checks are review signals, not a guarantee of accuracy. Verify material fields against the original statement before using an export for bookkeeping, reporting, or accounting import.

## Privacy

Core PDF conversion and OCR run in your browser; the original PDF is not sent to a conversion server. Optional Ask ExtractMint is separate: submitting a question sends the question, filename, document details, and up to five extracted rows to the agent endpoint and may share that context with a configured AI provider. Review JSON and review-pack exports contain extracted details, and a review pack may also contain the original PDF if you include it. See the [privacy and data-flow details](https://extractmint.iangoh.com/privacy/).

## Related guides

- [Bank statement to Excel](https://extractmint.iangoh.com/convert/bank-statement-to-excel/)
- [Scanned bank statement to Excel](https://extractmint.iangoh.com/convert/scanned-bank-statement-to-excel/)
