# Task 1 final parser guards

Updated `src/lib/converter.ts` to narrow receipt payable-total selection, prioritize Balance Due, and exclude savings, discount, and nonpayable total qualifiers. Tax extraction now requires tax-specific amount labels, excludes inclusive-total and tax-rate lines, and retains explicit tax total and currency-marked VAT/GST/SST amount forms. Payment labels are excluded from merchant candidates.

Verification: `git diff --check` passed. No tests or test commands were run, per instruction.
