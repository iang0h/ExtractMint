# ExtractMint

> ExtractMint converts bank statements, receipts, invoices, scans, PDFs, DOCX files, spreadsheets, CSV, and plain text into clean working files for reconciliation and review.

## Summary

ExtractMint is a browser-based financial document extraction product for operators, founders, accountants, and bookkeepers. It reads messy business documents, separates useful fields, validates balance trails where possible, and exports working files that can be reviewed in spreadsheet or accounting workflows.

## Supported Documents

- PDF bank statements
- Scanned bank statements and images
- Receipts and invoices
- DOCX files
- XLSX, XLS, CSV, and plain text files

## Outputs

- Excel XLSX
- Combined XLSX workbooks
- CSV
- Xero-ready CSV
- Google Docs-ready DOCX
- PDF summaries
- QuickBooks-ready QBO
- Review JSON
- Review-pack ZIP

## Core Workflow

1. Upload a bank statement, receipt, invoice, scan, or office document.
2. ExtractMint reads dates, descriptions, references, withdrawals, deposits, amounts, tax fields, and balances where available.
3. Balance validation highlights rows that need review.
4. The user can edit rows, inspect source PDFs, export working files, or ask the ExtractMint agent what to check next.

## Differentiators

- Browser-side processing in the current static build.
- OCR fallback for scans and image-heavy PDFs.
- Optional local caches (OCR + PDF review index) can be persisted in the browser and cleared in-app.
- Balance-trail checks for bank statement reconciliation.
- Review JSON import and export for resume-later workflows.
- QuickBooks QBO export for accountant handoff.
- Xero-ready CSV export for manual statement imports.
- FreeLLMAPI-ready Ask ExtractMint agent for conversion questions.

## Key Pages

- [Home and converter](/)
- [Bank statement to Excel](/convert/bank-statement-to-excel/)
- [PDF bank statement to Excel](/convert/pdf-bank-statement-to-excel/)
- [Scanned bank statement to Excel](/convert/scanned-bank-statement-to-excel/)
- [CIMB bank statement to Excel](/convert/cimb-bank-statement-to-excel/)
- [Maybank statement to Excel](/convert/maybank-bank-statement-to-excel/)
- [Singapore bank statement to Excel](/convert/singapore-bank-statement-to-excel/)

## FAQ

### What does ExtractMint convert?

ExtractMint converts bank statements, receipts, invoices, PDFs, DOCX files, spreadsheets, CSV files, scans, and plain text into structured exports.

### Are files uploaded to a server?

The current static version processes files in the browser. A future SaaS backend can add accounts, credits, server OCR, retention controls, and audit logs.

### Should scanned statements be reviewed?

Yes. Scanned statements rely on OCR and should be checked against the original statement before accounting use.
