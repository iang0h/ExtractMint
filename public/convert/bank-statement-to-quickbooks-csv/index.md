# Bank Statement to QuickBooks CSV Converter

> ExtractMint converts bank statement PDFs into a QuickBooks-friendly 3-column CSV (Date, Description, Amount), plus Excel exports for review.

## What This Page Covers

Use this converter when you want a simple CSV you can manually upload into QuickBooks bank transactions, without losing rows to date/amount formatting issues.

## What It Extracts

- Date
- Description
- Reference
- Withdrawal or debit
- Deposit or credit
- Amount (or net derived from debit/credit/tax where possible)
- Running balance where available
- Category and confidence signals

## Import Sanity Checks

QuickBooks CSV imports can fail or silently omit rows when dates or amounts are invalid. ExtractMint flags common problems before download:

- Missing date
- Missing or zero amount
- Ambiguous numeric date formats (DD/MM vs MM/DD)
- Oversized exports (recommend splitting by date range)

## Export Formats

- QuickBooks-friendly CSV (Date, Description, Amount)
- QuickBooks-ready QBO (OFX)
- Excel XLSX
- CSV (full ExtractMint columns)
- Review JSON
- Review-pack ZIP

## Related Pages

- [Bank statement to QBO](https://extractmint.iangoh.com/convert/bank-statement-to-qbo/)
- [Bank statement to Excel](https://extractmint.iangoh.com/convert/bank-statement-to-excel/)
- [Bank statement to Xero CSV](https://extractmint.iangoh.com/convert/bank-statement-to-xero-csv/)

