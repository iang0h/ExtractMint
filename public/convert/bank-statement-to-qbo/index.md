# Bank Statement to QBO Converter

> ExtractMint converts bank statement PDFs into QuickBooks-ready QBO (OFX) files, plus Excel and CSV exports for review.

## What This Page Covers

Use ExtractMint when you want a QBO file you can import into QuickBooks Online, without losing rows to date/amount formatting issues.

## What It Extracts

- Date
- Description
- Reference
- Withdrawal or debit
- Deposit or credit
- Amount
- Running balance where available
- Category and confidence signals

## Import Sanity Checks

QuickBooks imports can silently omit rows when dates or amounts are invalid. ExtractMint flags common problems before download:

- Missing date
- Missing or zero amount
- Ambiguous numeric date formats (DD/MM vs MM/DD)

## Export Formats

- QuickBooks-ready QBO (OFX)
- Excel XLSX
- CSV
- Review JSON
- Review-pack ZIP

## Related Pages

- [Bank statement to Excel](https://extractmint.iangoh.com/convert/bank-statement-to-excel/)
- [PDF bank statement to Excel](https://extractmint.iangoh.com/convert/pdf-bank-statement-to-excel/)
- [Scanned bank statement to Excel](https://extractmint.iangoh.com/convert/scanned-bank-statement-to-excel/)
- [Bank statement to Xero CSV](https://extractmint.iangoh.com/convert/bank-statement-to-xero-csv/)

