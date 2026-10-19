# Task 2 report: Make upload, review, and Excel the primary path

## Changes

- Replaced the sample card with the quiet **Try a sample statement** action, a separate sample PDF link, and a short browser-local processing note.
- Moved Force OCR, OCR language, persistent OCR cache, and persistent PDF review index into a collapsed **Advanced options** disclosure. Existing preferences, cache statistics, and clear handlers are preserved.
- Added a completed-result summary with the active filename, extracted row count, and **Download Excel** using the existing active-result exporter.
- Moved secondary file exports into **More export formats** and placed the review-pack source PDF checkbox beside its ZIP action. The existing export handlers, labels, and enablement rules remain intact. The support-copy action is available once under Privacy and support.
- Changed balance checks to a native disclosure. Its status remains visible, full metrics start collapsed for passing or insufficient-data results, and discrepancy details open by default.
- Combined privacy and support content under one **Privacy and support** disclosure, retaining cache clearing, support copy, optional email, telemetry history and clearing, and PDF redaction behavior.
- Preserved Task 1 result/export gates and kept the code patch limited to `src/App.tsx`.

## Commit

- Implementation commit: `df4a8f1` — `Refine converter primary workflow`

## Verification

- No tests were added or run, and no build was run, per instruction.
- `git diff --check` passed before commit.
- Visual verification was not performed.

## Concerns

- No known functional concerns. Styling for the new disclosure and result classes is deferred to Task 3, which owns `src/App.css`.
