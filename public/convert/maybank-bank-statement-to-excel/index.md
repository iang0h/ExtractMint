# Maybank Statement to Excel: Review Guide

> Try a Maybank statement PDF in a browser-based converter. Maybank-specific layouts are not independently validated, so review each row before export.

This is a general statement-conversion workflow, not an official Maybank integration. ExtractMint has not been independently validated against real Maybank statements.

## Convert and review

1. Open the [bank statement converter](https://extractmint.iangoh.com/#converter) and choose a statement PDF.
2. Compare dates, descriptions, debit and credit values, and running balances with the PDF.
3. Resolve flagged rows before exporting the working spreadsheet.

Text-based PDFs are the strongest input. Scans can use browser OCR, but unclear text should be reviewed manually.

## What the current test covers

The local regression benchmark uses invented English and Malay digital-PDF layouts. It does not include real Maybank statements and does not establish bank-specific or scanned-PDF accuracy.

## Review checklist

- Confirm day-first or month-first dates, particularly ambiguous dates.
- Verify the source's debit and credit labels and check whether refunds use the opposite sign.
- Inspect wrapped descriptions, references, and page breaks.
- Reconcile opening and closing balances before bookkeeping use.

## Related Pages

- [CIMB statement to Excel](https://extractmint.iangoh.com/convert/cimb-bank-statement-to-excel/)
- [Scanned bank statement to Excel](https://extractmint.iangoh.com/convert/scanned-bank-statement-to-excel/)
- [Singapore bank statement to Excel](https://extractmint.iangoh.com/convert/singapore-bank-statement-to-excel/)
