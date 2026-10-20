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

## Follow-up review fixes

- Added a keyboard-accessible **Privacy and support details** link from the browser-processing note to the existing `#support` disclosure.
- Gated balance status on `activeResult && !isProcessing`, preserving its existing threshold, labels, and default-open discrepancy details.
- Follow-up code commit: `cbd9b17` — `Link privacy note and gate balance status`.
- No tests or build were run, per instruction. `git diff --check` passed before this follow-up commit.

## TypeScript import cleanup

- Removed the unused lucide `Copy` import reported by TypeScript; the privacy-safe support action remains available as text under Privacy and support.
- No tests or build were run for this focused fix, per instruction.

## Desktop pilot Task 2: Privacy boundaries and native exports (2026-10-20)

### Changes

- `src/main.tsx` renders Vercel's `<Analytics />` only outside the `desktop` Vite mode. `src/lib/analytics.ts` returns before Vercel's custom `track()` call in desktop mode, covering upload, conversion, sample, and export action events as well as page analytics.
- `src/App.tsx` hides the complete remote assistant section in desktop mode. `askAgent` also returns immediately in desktop mode, before reading the question, changing chat state, or reaching the sole `/api/agent/` POST. The web assistant condition and request payload remain unchanged.
- Added `src/lib/download.ts` with `saveExport(blob, filename, mimeType): Promise<boolean>`. Desktop mode dynamically loads the installed Tauri Save-dialog and filesystem plugins, supplies the existing output filename and a static format filter, and passes the returned path directly to `writeFile` with the existing Blob's bytes. The source file, OCR text, extracted rows, and passwords are not supplied as dialog metadata. No network request, custom filesystem command, base-directory option, broad scope, persisted scope, or source-file read is introduced.
- The helper returns `false` on dialog cancellation before converting the Blob to bytes or writing anything. Native import, dialog, conversion-to-bytes, and write failures become a fixed user-facing error without logging or exposing a native path or error payload.
- The web helper retains object-URL creation, an anchor with the existing download filename, anchor click, and object-URL revocation. Existing blob creators and output filename expressions are retained for all exports.
- Routed all five single-document formats (XLSX, CSV, DOCX, PDF, QBO), review JSON, review ZIP with optional sources, privacy-safe diagnostic JSON, combined XLSX, and both receipt batch formats through `saveExport`.
- Included `src/components/PdfRedactionTool.tsx` because its redacted PNG and redacted-pages ZIP are support exports. Their rendering, ZIP contents, and filename expressions are unchanged. Both use `saveExport`; the existing web ZIP logging is retained only in web mode, and desktop failures use fixed messages. The redaction status area now announces errors through `role="status"` and `aria-live`.
- Save cancellation does not emit an export event or display success. Batch exports restore the previous progress status and release the processing flag in `finally`. Redaction ZIP cancellation restores its previous status without scheduling a timer that would clear it. Single-document, review JSON, diagnostic JSON, and redacted PNG cancellation leave their status unchanged.
- Export failures appear in the existing app progress/error area, including single-document, review JSON, and diagnostics, which previously lacked catches. Redacted support export failures appear in the existing redaction status area. The support request clipboard action remains a clipboard copy.

### Static verification and scope

- Inspected the full focused diff and searched all `src` files for `createObjectURL`, anchor `.download` assignments, `saveExport`, Vercel `track`, and `/api/agent/` calls. All generated-file download anchors are consolidated in the web branch of `saveExport`. Remaining object URLs in `App.tsx` support local input/source previews. The static synthetic sample PDF download remains its original link because it is an input sample, not a generated export.
- Inspected the installed Tauri plugin declarations: `save` returns `Promise<string | null>` and adds only the selected path to the filesystem scope; `writeFile` accepts that path and `Uint8Array` bytes. The implementation uses these installed APIs directly.
- Rechecked the existing Task 1 permission model: Rust already registers only the dialog and filesystem plugins, and `default.json` contains only `dialog:allow-save` and `fs:allow-write-file`. No Rust, capability, dependency, lockfile, or package-script modification was needed. No permissions were broadened.
- Inspected app error visibility: `showProgressPanel` includes `progress.stage === 'error'`, and the panel already has `role="status"` and `aria-live="polite"`.
- Applied a source review using the React best-practices guidance: desktop guards occur before async work, Tauri modules load only in the desktop branch, independent imports load together, export work stays in event handlers, no hooks were added or reordered, and errors have an announced status area.
- `git diff --check` completed without output before commit.
- No tests, lint/type checking, frontend builds, native builds, app launches, or runtime checks were run, per the task instruction. Actual native dialog behavior, cancellation, selected-path permissions, failed writes, and web/desktop runtime behavior remain unverified.

## Desktop downloads Task 2: Signed draft release workflow (2026-10-20)

### Status and implementation commit

- Status: implementation complete and statically reviewed. Signed installers have not been built or represented as available.
- Implementation commit: `78132e2a640682cf045fd8b06a58b39d55c55275` — `feat: build verified signed desktop draft releases`.
- Report path: `.superpowers/sdd/task-2-report.md` in the assigned `clean-converter-workspace` worktree.

### Changes and self-review

- Added `scripts/check-desktop-release-version.mjs`, using Node built-ins only. It accepts exactly one `extractmint-vX.Y.Z` tag and compares its suffix with `package.json.version`, `package-lock.json.packages[""].version`, `src-tauri/Cargo.toml`'s `[package]` version, and `src-tauri/tauri.conf.json.version`. Read, parse, missing-field, and mismatch failures print only a static file/field identifier; values are not included.
- Added `.github/workflows/desktop-release.yml`, triggered only by `extractmint-v*` tag pushes. Preflight checks versions and all eight required signing secret names before either platform job can start. Missing-secret messages contain names only. All secret injections use `${{ secrets.* }}` into step environment variables.
- macOS installs Node 24 and stable Rust with both Apple targets, imports the base64 P12 into a temporary keychain, requires exactly one valid Developer ID Application identity, and sets `APPLE_SIGNING_IDENTITY`. It runs the prescribed universal DMG build with Apple notarization credentials, requires exactly one app and DMG, verifies the app with `codesign --verify --deep --strict` and `xcrun stapler validate`, and checks that `lipo -archs` reports exactly Intel and Apple Silicon architectures. Only the verified `ExtractMint-macOS-universal.dmg` is uploaded, with one-day retention.
- Windows requires an x64 runner, imports the PFX, requires one certificate with a private key, and generates the runtime-only Tauri config with its thumbprint, SHA-256 digest, and DigiCert timestamp URL. The prescribed NSIS build must produce exactly one EXE with Authenticode status `Valid` and a signer matching the imported certificate. Only the verified `ExtractMint-Windows-x64-setup.exe` is uploaded, with one-day retention.
- Both platforms have `always()` cleanup steps before artifact upload. macOS deletes the certificate file and temporary keychain. Windows deletes the PFX, generated config, and selected certificate from the current-user store. Cleanup failure also prevents successful artifact upload and draft creation.
- Only the final job receives `contents: write`; other jobs inherit `contents: read`. The final job needs both platform jobs, downloads only their named artifacts, verifies exactly the two nonempty expected asset files, and invokes `gh release create --draft --verify-tag` with only those files. There is no automatic publication or unsigned fallback, and no failure-tolerant build/sign/verification steps.
- Base Tauri config modification was unnecessary because all Windows signing settings are generated at runtime. The existing `desktop-v*` preview workflow is unchanged.

### Verification evidence

- `node --check scripts/check-desktop-release-version.mjs` exited 0; this was a syntax-only inspection and did not run the checker.
- The installed Prettier YAML parser successfully parsed the new workflow.
- `bash -n` successfully parsed all five multiline Bash blocks in the workflow; their commands were not executed.
- `git diff --cached --check` exited 0 before the implementation commit and showed exactly the two implementation files.
- `git diff --exit-code HEAD -- .github/workflows/desktop-build.yml src-tauri/tauri.conf.json` exited 0 before the implementation commit, confirming those files were unchanged.
- Inspected the complete new files and all `needs`, permissions, secret references, cleanup conditions, retention settings, and draft-creation arguments against the Task 2 brief.
- No tests, builds, signing operations, version-checker runtime invocations, release tags, external release creation, or credential retrieval were performed.

### Concerns and limits

- Actual Apple certificate import/notarization and Windows signing remain unverified until the owner configures the eight repository secrets and runs a release tag. No credentials were requested in chat.
- PowerShell blocks were inspected as source but were not parsed or executed on this macOS host.
- The workflow is deliberately fail-closed: absent/invalid credentials, signing errors, ambiguous outputs, verification failures, cleanup failures, or failed artifact transfers stop draft creation.
- The separate release-publication/manifest workflow remains Task 3. The unrelated in-progress `.superpowers/sdd/progress.md` change was preserved and excluded from the implementation commit.
- Reviewed the official [Tauri macOS signing guide](https://v2.tauri.app/distribute/sign/macos/), [Tauri Windows signing guide](https://v2.tauri.app/distribute/sign/windows/), and [download-artifact usage](https://github.com/actions/download-artifact) for environment/configuration names and artifact API usage.
