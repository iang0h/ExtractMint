# Bank CSV Cleaner (QuickBooks & Xero)

ExtractMint includes a **Bank CSV cleaner** for when your bank export is messy (extra columns, inconsistent amounts, odd date formats, or balance columns that accounting software rejects).

Use it to:

- Auto-map Date / Amount / Description (and optional Reference / Balance / Debit / Credit).
- Generate a cleaned ExtractMint table you can convert to Excel and review packs.
- Export a **QuickBooks-friendly 3-column CSV** (Date, Description, Amount).
- Export a **Xero-ready bank statement CSV** (Date, Amount, Payee, Description, Reference).

## How it works

1. Open the cleaner: https://extractmint.iangoh.com/#bank-csv-cleaner
2. Upload your bank-export `.csv` or `.xlsx`
3. Click **Auto-map columns** (or map manually)
4. Export the format you need (QuickBooks CSV, Xero CSV, or cleaned ExtractMint table)

## Notes

- ExtractMint runs as a **local-first static app** today. Your files are processed in the browser.
- If QuickBooks rejects your import, try smaller chunk sizes (for example 500 rows) and ensure the Date format matches the expected import format.

## Links

- Home: https://extractmint.iangoh.com/
- Converter: https://extractmint.iangoh.com/#converter
- Pricing: https://extractmint.iangoh.com/pricing/
- Privacy: https://extractmint.iangoh.com/privacy/
