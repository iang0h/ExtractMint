# Singapore Bank Statement to Excel: Review Guide

> Try a Singapore bank statement PDF in a browser-based converter. Singapore-specific layouts are not independently validated, so review each row before export.

This is a general statement-conversion workflow, not an official bank integration. ExtractMint has not been independently validated against real Singapore bank statements.

## Convert and review

1. Open the [bank statement converter](https://extractmint.iangoh.com/#converter) and choose a statement PDF.
2. Check dates, currency, descriptions, debit and credit values, and balances against the source.
3. Review fees, reversals, and any value dates before exporting.

Text-based PDFs are the strongest input. Scans can use browser OCR, but unclear text should be reviewed manually.

## What the current test covers

The local regression benchmark uses invented English and Malay digital-PDF layouts. It does not include real Singapore bank statements and does not establish bank-specific or scanned-PDF accuracy.

## Review checklist

- Confirm the currency and date order before interpreting amounts.
- Check transaction and value dates separately when both appear.
- Verify fees and reversals against the statement's debit/credit columns.
- Compare opening and closing balances before accounting use.

## Related Pages

- [Bank statement to Excel](https://extractmint.iangoh.com/convert/bank-statement-to-excel/)
- [PDF bank statement to Excel](https://extractmint.iangoh.com/convert/pdf-bank-statement-to-excel/)
- [Scanned bank statement to Excel](https://extractmint.iangoh.com/convert/scanned-bank-statement-to-excel/)
