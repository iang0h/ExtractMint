# Bank Statement to Excel Converter

> ExtractMint converts bank statement PDFs into Excel and CSV rows for accounting, bookkeeping, and reconciliation.

## What This Page Covers

Use ExtractMint when you need to turn a bank statement into spreadsheet rows with useful transaction fields preserved.

[Try a synthetic example](https://extractmint.iangoh.com/#load-synthetic-sample) in the converter. You can also [inspect the invented sample PDF](https://extractmint.iangoh.com/samples/synthetic-bank-statement.pdf).

## Invented Sample Ledger

The try-it PDF is generated. It contains only three synthetic English transactions, with invented amounts and descriptions. It is not a real account or bank statement.

| Date | Description | Reference | Withdrawal | Deposit | Balance |
| --- | --- | --- | ---: | ---: | ---: |
| 03/04/2026 | Studio supplies | SYN-EN-001 | 125.50 | — | 874.50 |
| 05/04/2026 | Project credit | SYN-EN-002 | — | 300.00 | 1,174.50 |
| 07/04/2026 | Service charge | SYN-EN-003 | 62.00 | — | 1,112.50 |

Opening 1,000.00 + deposits 300.00 − withdrawals 125.50 − 62.00 = closing 1,112.50.

## Review Checklist

1. Confirm the statement period and each transaction date against the source PDF.
2. Compare descriptions and references with the original rows, including rows split across pages.
3. Check debit and credit direction so withdrawals and deposits appear in the right columns.
4. Check each running balance against the previous balance and transaction amount.
5. Reconcile opening balance, deposits, withdrawals, and closing balance before export or accounting use.

## What It Extracts

- Date
- Description
- Reference
- Withdrawal or debit
- Deposit or credit
- Amount
- Tax fields where visible
- Running balance where available
- Category and confidence signals

## Why Balance Columns Matter

Running balances give accountants and operators a way to detect missing rows, page-break errors, and debit or credit misreads. ExtractMint highlights validation issues so the exported workbook can be checked before use.

## Export Formats

- Excel XLSX
- CSV
- Google Docs-ready DOCX
- PDF summary
- QuickBooks-ready QBO
- Review JSON
- Review-pack ZIP

## Best Fit

- Text-based PDF bank statements with transaction tables.
- Bookkeepers converting client statements into spreadsheets.
- Founders or operators preparing monthly reconciliation files.
- People who want to review extracted rows and balances before exporting.

## What the Current Test Covers

The try-it sample is one generated digital PDF with three synthetic English transactions. Separately, ExtractMint's local regression benchmark uses two generated digital PDFs with invented English and Malay statement layouts and checks six synthetic transaction rows total. These checks do not prove real-bank coverage, scanned-PDF OCR quality, or production accuracy.

## Bank-Format Limitations {#bank-format-limitations}

No bank-specific format has been independently validated against real statements, including CIMB, Maybank, or Singapore bank formats. Layouts vary, and scans can introduce OCR errors. Check statement dates, transaction content, and balances against each export before using it for accounting.

## Related Pages

- [PDF bank statement to Excel](https://extractmint.iangoh.com/convert/pdf-bank-statement-to-excel/)
- [Scanned bank statement to Excel](https://extractmint.iangoh.com/convert/scanned-bank-statement-to-excel/)

## Does the file leave my computer?

Core conversion and OCR run in your browser. If you ask the assistant, your question, file name, document details, and up to five extracted rows are sent to the agent endpoint; a configured AI provider may receive that context. The original PDF is not included. See the [privacy page](https://extractmint.iangoh.com/privacy/).

