# ExtractMint statement benchmark

## Context

ExtractMint currently converts files in the browser and uses a general parser for structured transactions. It has balance validation and several export formats, but there is no repeatable way to measure transaction extraction quality across statement layouts. A competitive claim about bank coverage or accuracy would be premature without a labeled corpus.

## Goal

Add a local command that repeatedly measures the current text-based PDF conversion path against labeled synthetic statements. The command should report transaction detection and field accuracy, and should fail when a fixture regresses.

## Design

Use an offline Node script that starts the existing Vite server in middleware mode, generates small digital PDFs in memory with the installed `jspdf` dependency, and passes them through the already-exported `convertFiles` path. Fixture definitions contain synthetic statement layout data and expected transaction rows. The report is explicitly marked synthetic and includes per-fixture and aggregate metrics.

Match expected and extracted rows one-to-one by transaction reference when available, falling back to normalized date plus description. Report expected and extracted transaction counts, matched-row precision/recall, exactness for date, description, amount, withdrawal, deposit, and balance, plus the converter's balance-validation status. Emit a concise terminal summary and optionally a machine-readable JSON report.

## Boundaries

- Do not use uploaded, customer, or real bank statement documents in the starter corpus.
- Do not send fixtures or results to a network service or competitor.
- Do not claim real-bank, scanned-PDF/OCR, or production accuracy from this synthetic text-PDF benchmark.
- Do not change parsing behavior or expose additional parser internals as part of adding the harness.
- Keep the existing browser conversion and privacy behavior intact.

## Acceptance criteria

- A documented npm command runs the synthetic PDF cases through the actual converter without external services.
- Terminal output identifies the corpus as synthetic and reports per-field and balance metrics.
- An optional JSON output can be saved to a caller-provided path.
- A row or field mismatch causes a non-zero exit status, making later parser regressions visible.
- The command succeeds on its included baseline fixtures, and the production app still builds.

## Later benchmark stages

After choosing target markets, add real-world fixtures only with appropriate rights and consent, redact sensitive data, and preserve expected transaction labels. Add scanned-PDF/OCR fixtures separately. Compare ExtractMint and other converters on the same authorized corpus before publishing coverage or accuracy claims.
