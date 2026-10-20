# Desktop pilot Task 4: Document setup and preview limits

Read the approved desktop pilot plan at `docs/superpowers/plans/2026-10-20-extractmint-desktop-pilot.md`, the current `README.md`, and the existing Tauri configuration before editing.

## Scope

Update `README.md` with a concise ExtractMint desktop section for developers and accountant preview users.

## Requirements

- Document developer prerequisites: Node.js 24, Rust stable, macOS Xcode Command Line Tools, and Windows Microsoft C++ Build Tools plus WebView2.
- Document `npm run desktop:dev`, `npm run build:desktop`, and `npm run desktop:build`.
- Describe the app as a local-first desktop preview using the existing bank statement/receipt extraction and review/export flows. Do not claim receipt line-item extraction.
- State that desktop analytics and the remote assistant are disabled, and source documents, OCR text, and passwords stay on device. Explain that OCR engine assets may still be downloaded separately from the user's document files.
- Explain that CI artifacts are unsigned previews: macOS public distribution requires Developer ID signing and notarization; Windows public distribution needs a trusted signing or Store route. Do not imply credentials or a commercial installer are configured.
- List the features deliberately outside this pilot: firm/client accounts, cloud sync, billing/licensing, accounting software integrations, and receipt line-item extraction.
- Keep website commands and existing web deployment guidance intact.

## Constraints

- Edit only `README.md` and `.superpowers/sdd/task-4-desktop-docs-report.md`.
- Do not run tests, builds, launch the app, deploy, or publish anything.
- Do not add unsupported claims about security certification, accounting integrations, extraction accuracy, or commercial readiness.

## Completion

- Review the changed README section for accuracy and consistency with the current app/configuration.
- Run `git diff --check` only if needed; no tests/builds.
- Commit only README and the task report.
- Report that packaging/signing and Windows runtime still require the later build/release steps.
