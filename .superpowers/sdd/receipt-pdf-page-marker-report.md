# Receipt PDF page marker fix report

## Change

Receipt merchant fallback candidates now ignore standalone page markers such as `Page 1`, `Page 1 of 2`, `Page 1/2`, and equivalent page-only count labels. This prevents generated extraction headers from becoming the merchant and allows the existing missing-merchant review/export behavior to receive a blank merchant.

Explicit `Merchant:` labels and other merchant candidate rules are unchanged.

## Review and verification

- Reviewed `parseReceipt` and confirmed the heuristic fallback was the path accepting generated page headers.
- Tests were neither added nor run, as instructed.
- `git diff --check` passed.

## Concerns

None identified in the focused source review.
