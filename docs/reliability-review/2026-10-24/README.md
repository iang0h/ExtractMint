# ExtractMint reliability review — 24 October 2026

## Scope and result

This review used the supplied synthetic PDF fixtures and additional invented statements only. No real financial documents were used. The work fixes column-position parsing, source-row coverage and confidence checks, explicit date-format handling, export gating, and mobile horizontal overflow.

The built-in sample now preserves its printed opening balance and transaction directions. It is arithmetically reconciled, while its fallback column layout and ambiguous dates continue to require review. That conservative state is intentional: the sample does not have printed column headers that would justify a verified badge.

## Built-in sample: before and after

| Check | Before | After |
| --- | ---: | ---: |
| Opening balance | 874.50 (first transaction balance was mistaken for opening) | 1,000.00 |
| Withdrawals | Blank | 125.50 + 62.00 = 187.50 |
| Deposits | Blank | 300.00 |
| Net change | 487.50 (incorrectly shown as net) | +112.50 |
| Closing balance | 1,112.50 | 1,112.50 |
| Reconciliation discrepancy | -249.50 | 0.00 |
| Confidence / review | 98% match and Verified despite the failed check | 68% match; Needs review while date/layout warnings remain |

Arithmetic after the fix: `1,000.00 + 300.00 - 187.50 = 1,112.50`. The sample regression asserts those balances and a zero-cent discrepancy. It also asserts that the headerless sample remains in review; rows are not promoted to Verified solely because the totals happen to balance.

## Supplied statement regressions

The exact source ledgers and source-line locations are recorded in the tests. Results:

- Supplied US-format, separate Debit/Credit fixture: exactly 6 transactions; opening 5,000.00, credits 4,250.00, debits 1,917.00, closing 7,333.00; matched.
- Supplied multiline fixture: exactly 10 transactions, including continuation text and a page break.
- Supplied completeness fixture: all 132 transactions retained.
- Additional generated DD/MM fixture: 132 transactions over 7 pages, including repeated headers, a multi-line amount, and a description split across a page break. The document convention is detected as DD/MM/YYYY.
- Each fixture checks source provenance, balance totals, and transaction agreement across the on-screen ledger, CSV, Excel Rows sheet, and QBO. Missing descriptions and unresolved/conflicting dates remain unverified and block QBO where applicable.

The regression suite also covers signed amounts, separate debit/credit columns, parenthesized negatives, QBO field boundaries and escaping, and continued source-line attribution.

## Benchmark comparison

The synthetic digital-PDF benchmark moved from **0/6 to 6/6 transaction matches**. The before report still extracted 3 rows in each language case, but matched none of them and marked both ledgers for review. Inspection showed that the benchmark PDFs were generated without a table header or printed date-format clue, while the scoring fixture expected separate fields and an explicit DD/MM interpretation. The benchmark generator now emits the format represented by each case, and scoring canonicalizes dates with that declared format.

This corrects a mismatch between synthetic source generation and its expected ledger; it must not be described as proof of a real-world accuracy increase. The after report covers only 6 invented rows across two generated text PDFs (English and Malay). All listed fields matched and both balance checks passed. These results do not measure real-bank coverage, arbitrary scans/OCR quality, or production accuracy.

- [Before benchmark JSON](./benchmark-before.json)
- [After benchmark JSON](./benchmark-after.json)

## Browser and export checks

The browser suite passes at 320 px, 390 px, and 1280 px. It checks keyboard selection of a date convention, QBO availability after the choice, editable balance entry, CSV output after editing, source-line retention, and absence of page-level horizontal overflow. The wide transaction table scrolls within its own container. The initial browser reproduction confirmed page-width overflow; a 74 px page shift from focusing the far-right field was not reproduced in this local run.

- [Mobile date-choice review](./screenshots/mobile-390-date-gate.png)
- [Mobile far-right table columns](./screenshots/mobile-390-edited-far-right-columns.png)
- [Desktop results](./screenshots/desktop-1280-results.png)

QBO checks cover OFX 1.0.2 field limits, SGML escaping, long references/descriptions, memo overflow, non-ASCII rejection, and row/date/amount agreement. No file was imported into QuickBooks. See [QBO string handling](../2026-10-24-qbo-export-behavior.md) and the [FDX OFX Work Group](https://financialdataexchange.org/about-fdx/ofx-work-group/).

## Verification record

| Check | Result |
| --- | --- |
| `npm run test:provided-statements` | Pass: 6 US, 10 multiline, 132 supplied completeness, 132 generated DD/MM, sample reconciliation, provenance, and export agreement |
| `npm run test:statement-reliability` | Pass: extraction, reconciliation, confidence, date-choice, and export regressions |
| `npm run test:e2e:exports` | Pass: real-browser editing, recovery, and export blocking |
| `npm run test:e2e:reliability-layout` | Pass: 320 / 390 / 1280 px |
| `npm run test:agent` | Pass |
| `npm run test:seo` | Pass |
| `npm run test:synthetic-sample` | Pass: 5 checks |
| `npm run benchmark:statements -- --json docs/reliability-review/2026-10-24/benchmark-after.json` | Pass: 6/6 synthetic matches |
| `npm run build` | Pass; Vite reports a large-chunk advisory |
| `npm run lint` | One pre-existing error remains at `src/App.tsx:758` (`react-hooks/set-state-in-effect`). `src/App.tsx` was not changed in this review; the QBO regex lint error introduced during this work was fixed. |

Node PDF tests emit PDF.js environment warnings about standard font data; the test commands still pass. No deployment, push, or public release was performed.

## Not verified

- Real bank-specific layouts and real financial statements (excluded by the synthetic-only constraint).
- Camera photos, low-quality scans, and broader OCR performance beyond the invented fixtures.
- Import acceptance in QuickBooks or another external accounting product.
- Layout families not represented by the supplied or generated synthetic fixtures.
