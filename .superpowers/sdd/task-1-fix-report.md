# Task 1 Receipt Parser Fix Report

- **Payable total:** Excluded subtotal spellings and tax/VAT/GST/SST total labels before choosing a receipt total. A subtotal-only receipt now leaves `amount` undefined.
- **Tax amount:** Filtered out percentage-only tax matches and prefers a remaining explicitly currency-marked tax amount when available.
- **Merchant:** Excluded metadata-label-only lines after date and amount removal, so labels such as `Date:` cannot be inferred as merchants.

**Verification:** `git diff --check` passed. Automated tests and test commands were not run as instructed; behavior was reviewed at source level. Bank statement parsing paths were not changed.
