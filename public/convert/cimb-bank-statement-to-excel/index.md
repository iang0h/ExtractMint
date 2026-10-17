# CIMB Bank Statement to Excel: Review Guide

> Try a CIMB statement PDF in a browser-based converter. CIMB-specific layouts are not independently validated, so review each row before export.

This is a general statement-conversion workflow, not an official CIMB integration. ExtractMint has not been independently validated against real CIMB statements.

## Convert and review

1. Open the [bank statement converter](https://extractmint.iangoh.com/#converter) and choose a statement PDF.
2. Check the extracted dates, descriptions, references, withdrawals, deposits, tax fields, and balances against the original.
3. Compare opening and closing balances and resolve flagged rows before exporting.

Text-based PDFs are the strongest input. Scans can use browser OCR, but unclear text should be reviewed manually.

## What the current test covers

The local regression benchmark uses invented English and Malay digital-PDF layouts. It does not include real CIMB statements and does not establish bank-specific or scanned-PDF accuracy.

## Review checklist

- Confirm the statement period and date order.
- Compare withdrawal and deposit signs with the original column labels.
- Check descriptions and references that wrap across lines or pages.
- Reconcile opening and closing balances before accounting use.

## Related Pages

- [Bank statement to Excel](https://extractmint.iangoh.com/convert/bank-statement-to-excel/)
- [PDF bank statement to Excel](https://extractmint.iangoh.com/convert/pdf-bank-statement-to-excel/)
- [Maybank statement to Excel](https://extractmint.iangoh.com/convert/maybank-bank-statement-to-excel/)
- [Scanned bank statement to Excel](https://extractmint.iangoh.com/convert/scanned-bank-statement-to-excel/)
