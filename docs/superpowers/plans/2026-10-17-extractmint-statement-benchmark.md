# ExtractMint statement benchmark implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local CLI that measures ExtractMint's text-based PDF transaction extraction against synthetic, gold-labeled statements.

**Architecture:** Define synthetic statement layouts and expected rows as local fixtures. A Node CLI uses the installed `jspdf` library to generate digital PDFs in memory, starts Vite in middleware mode to load the existing converter module, and runs the PDFs through `convertFiles`. It prints per-case and aggregate precision, recall, field exactness, and balance-validation results, with optional JSON output.

**Tech Stack:** Node.js 24, Vite SSR (`vite.ssrLoadModule`), existing `jspdf` and converter dependencies.

## Global Constraints

- Fixtures contain invented transaction/account data only. Do not use customer, uploaded, or real bank statements.
- The command runs locally and must not call network services or competitor APIs.
- Label the corpus as synthetic in terminal and JSON output. Do not represent its scores as real-bank, scanned-PDF/OCR, or production accuracy.
- Do not change conversion/parsing behavior, browser UI, or deployment configuration.
- Do not add a test framework. The benchmark command itself is the requested evaluation artifact.
- Preserve the existing uncommitted visual redesign changes in `src/App.tsx`, `src/App.css`, and `src/index.css`.

## File Structure

- `benchmarks/statements/fixtures.mjs` — synthetic PDF layout inputs and expected transaction rows.
- `scripts/benchmark-statements.mjs` — in-memory PDF generation, converter loading, one-to-one row matching, metrics, CLI output, optional JSON writing, and regression exit code.
- `package.json` — `benchmark:statements` script.
- `README.md` — command usage, metric definitions, and synthetic-corpus limitations.

## Tasks

### Task 1: Add synthetic statement fixtures

- [ ] Create two small, invented statement cases with distinct references, exact expected rows, opening/closing balances, and layouts that exercise English and Malay table headers.
- [ ] Keep fixture data in a JavaScript module with explicit `synthetic` corpus metadata; include enough inert statement text to avoid triggering OCR in generated digital PDFs.
- [ ] Confirm there are no real account numbers, names, or transactions in the fixture data.

### Task 2: Build the offline benchmark CLI

- [ ] Generate one text-based PDF per fixture in memory, positioning columns to match the converter's PDF text-column extraction.
- [ ] Load `convertFiles` through a Vite SSR server in middleware mode and convert each generated PDF.
- [ ] Pair expected and extracted transaction rows one-to-one by reference, with normalized date/description as fallback; report expected/predicted counts, precision/recall, exact field rates, and converter balance status.
- [ ] Print a concise terminal summary. Support an optional `--json <path>` output. Exit non-zero if row or expected-field mismatches occur.
- [ ] Ensure the Vite server closes on success and errors.

### Task 3: Wire, document, and verify

- [ ] Add `npm run benchmark:statements` and document its command, output, metric meanings, and boundaries in `README.md`.
- [ ] Run the benchmark command and inspect its terminal report and JSON output.
- [ ] Run `npm run build` and `npm run lint`; confirm only planned files plus the pre-existing visual changes are modified.

## Completion Criteria

- The benchmark command runs fully offline and passes its synthetic baseline cases.
- Its report separates exact supported-fixture results from any future real-bank measurements.
- An intentional mismatch is represented as a failed regression (non-zero command status).
- Production build and lint remain clean.
