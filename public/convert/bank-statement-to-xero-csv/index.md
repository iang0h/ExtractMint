# Bank Statement to Xero CSV Converter

> ExtractMint converts bank statement PDFs into Xero-ready bank statement CSV imports, plus Excel and generic CSV exports for review.

## What This Page Covers

Use ExtractMint when you want a Xero-importable bank statement CSV file and you need guardrails for common date/amount import failures.

## What It Extracts

- Date
- Description
- Reference
- Amount (debit/credit)
- Running balance where available
- Confidence and validation signals

## Import Sanity Checks

Xero imports can fail or skip rows if date formats do not match your organization region settings, amounts are missing, or references trigger dedupe rules. ExtractMint flags:

- Missing date
- Missing amount
- Ambiguous numeric dates (DD/MM vs MM/DD)
- Potential duplicates (same date + description + amount)

## Export Formats

- Xero-ready bank statement CSV
- Excel XLSX
- Generic CSV
- Review JSON
- Review-pack ZIP

## Related Pages

- [Bank statement to Excel](https://extractmint.iangoh.com/convert/bank-statement-to-excel/)
- [PDF bank statement to Excel](https://extractmint.iangoh.com/convert/pdf-bank-statement-to-excel/)
- [Scanned bank statement to Excel](https://extractmint.iangoh.com/convert/scanned-bank-statement-to-excel/)
- [Bank statement to QBO](https://extractmint.iangoh.com/convert/bank-statement-to-qbo/)

