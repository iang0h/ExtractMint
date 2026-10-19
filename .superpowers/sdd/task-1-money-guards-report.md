# Task 1: Receipt money guards

## Changes

- Excluded pre-tax, before-tax, and excluding-tax total labels in either supported ordering, including spaced and hyphenated forms.
- Filtered total amount matches that are followed by percentage syntax before selecting the payable amount.
- Recognized plain VAT, GST, and SST amount labels, including `Total VAT`, while retaining exclusions for inclusive tax and rate-only values.
- Kept tax-total labels out of payable-total selection.

## Verification

- Source-level review against the requested examples and preserved cases.
- `git diff --check` passed.
- No tests or test commands run, as instructed.
