# Receipt parser edge fix report

- Excluded pre-tax and taxable-amount labels from payable-total candidates and gave Amount Due the same preference as other explicit payable labels.
- Excluded tax/VAT/GST identifiers and registration metadata from tax amounts while retaining monetary tax labels and the existing rate-only filtering.
- Merchant inference now rejects value-bearing metadata rows, including date/time, receipt/invoice identifiers, tax identifiers, terminal/POS, cashier/operator, payment details, and reference identifiers.

Verification: source-level review and `git diff --check` only. Automated tests and test commands were not run, per instruction. Bank-statement behavior is unchanged because the edits are confined to `parseReceipt`.
