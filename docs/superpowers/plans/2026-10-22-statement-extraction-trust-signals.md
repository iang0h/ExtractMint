# Statement extraction and trust signals

## Goal

Correct the synthetic sample's transaction directions, opening balance, date interpretation, reconciliation, confidence, and review labels. Add synthetic regression coverage for multiple statement layouts and exports. Remove developer-roadmap language from the homepage and keep the Ask data-flow disclosure accurate.

## Constraints

- Use synthetic statements only; do not inspect or process real financial documents.
- Do not change pricing or branding.
- Keep existing export formats and app workflows intact.
- Do not claim the complete application always stays on-device; Ask sends the question, filename, and up to five extracted rows to its endpoint.

## Implementation sequence

1. Add synthetic regression fixtures and tests first: the shipped sample, signed single-amount rows, separate debit/credit columns, and a multipage statement. Assert transaction fields, date convention, opening/closing/net reconciliation, validation labels/confidence, and CSV/XLSX/QBO output values.
2. Fix table extraction for headered and headerless positioned rows. Map debit/credit values from statement column positions and reconcile their direction against successive balances; flag conflicts or unresolved transaction fields for review.
3. Parse explicit opening and closing balance markers separately from transactions. Reconcile opening + deposits − withdrawals against closing and row balance deltas.
4. Detect date convention from unambiguous dates, keep the source date, normalize using the detected convention, and expose a user control to switch DMY/MDY interpretation. Ambiguous or invalid dates require review.
5. Derive confidence and row verification from parsed fields and validation results. Failed or incomplete checks cannot display a high-confidence match or “Verified.”
6. Update homepage copy: beta label, visible issue-report link, remove roadmap/SaaS-readiness claims, and keep desktop/paid plans secondary. Confirm /privacy continues to disclose the Ask payload accurately without blanket on-device claims.
7. Run focused synthetic regressions, existing statement benchmark, lint, and production build; inspect the final diff and sample UI result.

## Review checkpoints

- Confirm tests fail against the current parser before implementation.
- Confirm all four synthetic statement layouts and exports pass after implementation.
- Confirm the live sample shows opening $1,000.00, withdrawals $125.50 and $62.00, deposit $300.00, net +$112.50, closing $1,112.50, and zero discrepancy.
- Confirm no real statement data or pricing/branding changes entered the diff.

## Known test boundary

The supplied regression suite uses generated digital PDFs. Scanned-PDF OCR, real-bank templates, and external accounting-product import behavior are outside this synthetic-only test scope and must be reported as untested.
