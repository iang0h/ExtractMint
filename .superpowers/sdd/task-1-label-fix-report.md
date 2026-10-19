# Receipt parser label fixes

## Status
Implemented in `src/lib/converter.ts` and committed as `fix: normalize receipt label exclusions`.

## Changes
- Payable-total selection now prefers explicit payable labels including `Balance Due`; subtotal, before-tax, excluding-tax, pre-tax, and taxable-amount labels are excluded from payable totals.
- Subtotal matching accepts hyphenated and spacing variants.
- Tax candidates exclude nonpayable total qualifiers and tax/VAT/GST/SST identifiers, while retaining explicit `Total Tax` and `Tax Total` labels and the existing percentage-token guard.
- Merchant inference now rejects value-bearing metadata lines such as `Time 10:15`, including labels without colon/hash/dash separators, and recognizes SST and tax registration metadata.

## Verification
No tests or test commands were run, as instructed. Source-level reasoning was applied to the supplied examples and preserved prior parser guards. `git diff --check` completed without whitespace errors.

## Concerns
Receipt extraction remains heuristic for unusual OCR layouts. A missing payable total remains undefined on the row.
