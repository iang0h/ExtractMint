# Receipt statement-context fix report

## Change

Expanded `hasGenericStatementTable` statement context to recognize statement period, account number, opening balance, closing balance, running balance, and transaction history. A tab-separated table still needs Date, Description, and Amount headers before this context affects classification. Receipt date metadata without that full header remains unaffected.

## Review and verification

- Reviewed the classifier and receipt detection source paths.
- Tests were neither added nor run, as instructed.
- `git diff --check` passed.

## Concerns

None identified in the focused source review.
