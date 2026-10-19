# Clean Converter Workspace Design

## Context

The converter currently shows the upload control, sample actions, OCR controls, two persistent-cache controls, privacy and support disclosures, processing status, ten export actions, balance checks, and a review-pack option together. At narrower widths these sections form a long stack, and optional or technical actions compete with the main task.

The approved direction is a focused workbench organized around **Upload → review → download Excel**. This change is limited to the converter workspace shown in the supplied screenshot. The homepage, extraction pipeline, review workspace, and product capabilities are not being redesigned as part of this change.

## Goals

- Make the next action obvious for both first-time and returning users.
- Keep the default view short and calm, especially on mobile and narrow laptop windows.
- Make the extracted result and the primary Excel export easy to find after conversion.
- Keep every existing export, setting, privacy detail, support action, and validation detail available when needed.
- Preserve current file processing, batch, password, review, and export behavior.

## Design

### Default upload state

- Keep one prominent drop area with a short supported-format hint and a clear file-picker affordance.
- Show a quiet **Try a sample statement** action below the drop area. Keep the sample download secondary to loading the in-browser example.
- Show one concise privacy assurance near the upload action, such as **Files stay in your browser · Privacy details**. The privacy disclosure remains available from this link.
- Do not show a ready/progress card when no file or sample is being processed.
- Place technical processing controls inside a collapsed **Advanced options** disclosure.

### Processing state

- Show the existing progress/status card only while processing or when a file has a meaningful status to communicate.
- Keep the current inline, per-file PDF password prompt attached to its affected file and preserve its masked input, retry, cancellation, and memory-only handling.
- Keep the batch queue and current sequencing unchanged. Do not hide an actionable error or password request inside a collapsed section.

### Completed state

- Present a compact result summary with the active file name, conversion status, and available row/transaction count if already provided by the current result model.
- Make **Download Excel** the single dominant export action. It must call the existing Excel export for the active result and be disabled when no result is available.
- For multi-file batches, keep the active-file selection and existing combined-workbook behavior. The combined workbook remains a secondary action available in the additional exports section.
- Keep a concise validation status visible when it communicates a problem. A passing or insufficient-data balance breakdown may be collapsed under **Check balances**. If a discrepancy requires review, surface that status and keep the details one click away.

### Secondary actions and disclosures

- Put the remaining export actions under **More export formats**. Preserve Combined XLSX, Review JSON, Review pack (ZIP), Diagnostic, Support copy, Google Docs, PDF, CSV, and QuickBooks (QBO), with their current enablement rules and export functions.
- Keep the review-pack source-PDF checkbox available within the review-pack options, near its ZIP action; it should not appear as an unrelated checkbox in the default view.
- Put Force OCR, OCR language, persistent OCR cache, and persistent PDF review index in **Advanced options**. Preserve current stored preferences, cache statistics, and cache-clear behavior. Keep explanations for options that retain derived text in the browser.
- Keep trust/privacy and support/telemetry information in a reachable **Privacy and support** disclosure. Preserve cache clearing, support request copy, support email, telemetry clearing/history, and redaction helper behavior.
- Use native disclosure semantics or equally accessible controls; users must be able to expand and collapse these sections with a keyboard.

## Visual hierarchy and responsive behavior

- Use spacing and grouping to separate the primary task from secondary tools; avoid adding more cards, badges, or status labels without a user action attached.
- Use one clear primary button style for **Download Excel**. Render secondary actions as text links or quiet buttons inside their disclosure.
- Keep button labels descriptive and avoid technical jargon where a short plain-language label works. The exact export format names remain visible after opening **More export formats**.
- At narrow widths, stack the upload/result summary and primary action naturally, make controls full-width where needed, and prevent export actions from becoming a dense grid.
- Preserve the current brand palette and typography. This is a hierarchy and information-architecture refinement, not a broader visual rebrand.

## Boundaries

- Do not change extraction, OCR, password handling, review, batch processing, or export implementations.
- Do not remove or rename any supported export format or support capability.
- Do not change browser-local processing or introduce server-side file/password handling.
- Do not add dependencies or new analytics events for this visual simplification.
- Keep filenames and document-derived content out of analytics and support telemetry as currently specified.
- Do not redesign the homepage, navigation, marketing copy, or below-workspace sections.

## Acceptance criteria

1. Before a file is selected, the upload action is the clear primary focus and the technical controls are collapsed.
2. A user can load the synthetic sample without mistaking it for a production conversion or being distracted from file upload.
3. During processing, progress and actionable errors remain visible; a protected PDF can still be unlocked, retried, or canceled inline.
4. After conversion, the active result and **Download Excel** are immediately visible without first opening a disclosure.
5. Every existing export, including combined XLSX and review-pack source inclusion, remains available and follows its existing enablement rules.
6. Advanced OCR/cache settings, privacy details, support tools, and full balance details remain discoverable and operable by keyboard and screen reader.
7. A material balance discrepancy remains noticeable without requiring the user to hunt through a collapsed diagnostic section.
8. The workspace reads cleanly at the narrow viewport shown in the screenshot and at desktop width, without a crowded export grid.
9. Conversion, batch, password, and export outcomes remain unchanged.

## Verification approach

- Build the application and inspect the empty, processing, password-required, completed, and multi-file states at mobile/narrow and desktop widths.
- Exercise the main upload-to-Excel path and confirm each secondary export and setting remains reachable and behaves as before.
- Check keyboard operation, disclosure labels, focus visibility, and screen-reader names for the primary action and status messages.
- Confirm passing, missing-data, and discrepancy states are distinguishable, with discrepancy details available promptly.
- Use existing project verification commands and fixtures; do not add a new test framework for this hierarchy change.
