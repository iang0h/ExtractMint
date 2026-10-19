# Qualified receipt totals and tax labels

## Status
Implemented in `src/lib/converter.ts` and committed as `fix: handle qualified receipt totals and tax`.

## Changes
- Excluded savings and discount totals whether the qualifier appears before or after `Total`.
- Excluded pre-tax, before-tax, and excluding-tax totals from payable total selection while retaining qualified payable totals such as `Total inclusive of VAT`.
- Excluded inclusive/included tax, VAT, GST, and SST lines from tax candidates.
- Restored ordinary `Tax $…` and `Tax …` amount labels while excluding tax-rate labels and preserving existing tax metadata and explicit total-tax/VAT/GST/SST labels.
- Kept existing payment metadata exclusions and balance-due priority.

## Verification
No tests or test commands were run, as instructed. Source-level review was performed, and `git diff --check` completed without whitespace errors.

## Concerns
Parsing remains heuristic and depends on recognizable label wording.
