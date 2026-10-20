# ExtractMint Desktop Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the current local-first ExtractMint converter as macOS and Windows desktop preview apps.

**Architecture:** Use Tauri 2 to host the existing Vite frontend and its current extraction pipeline. A `desktop` Vite mode disables website-only analytics and remote assistant calls, while Tauri's dialog and filesystem plugins provide user-selected export destinations. GitHub Actions builds separate platform artifacts.

**Tech Stack:** React 19, TypeScript, Vite 8, Tauri 2, Rust, `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs`, GitHub Actions.

## Global Constraints

- Keep statement and receipt file bytes, extracted text, and passwords on the user's device.
- Do not emit Vercel Analytics events or call `/api/agent/` from desktop builds.
- Do not change web build behavior or existing extraction rules.
- Use Tauri capabilities that permit only the user-selected export path; do not grant broad filesystem access.
- Treat artifacts as unsigned previews until signing credentials are configured.
- Do not add accounts, sync, billing, licensing, integrations, or receipt line-item extraction to this pilot.

---

## File Map

- `package.json`: desktop dev/build scripts, Tauri CLI, and Tauri JavaScript plugins.
- `vite.config.ts`: relative asset base in desktop mode.
- `src/main.tsx`: omit Vercel Analytics from desktop builds.
- `src/App.tsx`: use desktop-safe assistant behavior and native export helper where applicable.
- `src/lib/analytics.ts`: make custom action events a no-op in desktop builds.
- `src/lib/download.ts`: browser download fallback and Tauri Save-dialog implementation.
- `src/components/PdfRedactionTool.tsx`: route generated redacted output through the shared save helper.
- `src-tauri/tauri.conf.json`: bundled frontend path, app identity, window defaults, and platform bundle targets.
- `src-tauri/Cargo.toml`, `src-tauri/build.rs`, `src-tauri/src/main.rs`: Tauri runtime and plugin registration.
- `src-tauri/capabilities/default.json`: minimal dialog and selected-path write permissions.
- `.github/workflows/desktop-build.yml`: macOS and Windows artifact builds.
- `README.md`: desktop setup, preview installation, privacy boundary, and release-signing caveats.

### Task 1: Add the Tauri desktop shell and desktop Vite mode

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/capabilities/default.json`
- Create: `src-tauri/icons/icon.png` (generated from `public/favicon.svg`)

- [x] Add `@tauri-apps/cli` as a development dependency; add `@tauri-apps/api`, `@tauri-apps/plugin-dialog`, and `@tauri-apps/plugin-fs` as runtime dependencies. Add the npm scripts `desktop:dev` (`tauri dev`), `desktop:build` (`tauri build`), and `build:desktop` (`tsc -b && vite build --mode desktop`).
- [x] Make Vite use `base: './'` only when `mode === 'desktop'`; leave the web base unchanged.
- [x] Configure Tauri to run `npm run dev -- --host 127.0.0.1 --mode desktop` in development and `npm run build:desktop` before bundling in release mode.
- [x] Configure `frontendDist` to `../dist`, product name `ExtractMint`, identifier `com.iangoh.extractmint`, one resizable 1440×960 main window with 1100×720 minimum size, and bundle targets `dmg` for macOS and `nsis` for Windows.
- [x] Register Tauri's dialog and filesystem plugins in Rust; request only the permissions needed to show a Save dialog and write the selected file.
- [x] Generate a platform-ready app icon from the existing `public/favicon.svg` using the Tauri icon command.

### Task 2: Keep desktop privacy boundaries and use native export dialogs

**Files:**
- Modify: `package.json`
- Modify: `src/main.tsx`
- Modify: `src/App.tsx`
- Modify: `src/lib/analytics.ts`
- Create: `src/lib/download.ts`
- Modify: `src/components/PdfRedactionTool.tsx`
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/capabilities/default.json`

- [x] Render `<Analytics />` only when `import.meta.env.MODE !== 'desktop'`.
- [x] Make `trackExtractMintEvent` return without calling Vercel `track` when `import.meta.env.MODE === 'desktop'`.
- [x] In desktop mode, prevent `askAgent` from posting to `/api/agent/` and hide the remote assistant prompt; keep web assistant behavior unchanged.
- [x] Add a `saveExport(blob, filename, mimeType)` helper. In desktop mode it opens the native Save dialog and writes the selected file with the Tauri filesystem plugin. In web mode it keeps the current object-URL download behavior.
- [x] Route every export action (single XLSX/CSV/DOCX/PDF/QBO, combined workbook, receipt batches, review packs, diagnostics, and PDF redaction PNG/ZIP outputs) through `saveExport` without changing file content or naming. Keep support request copy on the clipboard.
- [x] Handle dialog cancellation as a no-op and show a user-facing error if a chosen destination cannot be written.
- [x] Keep uploaded source files, OCR output, and passwords out of dialog metadata, logs, and remote requests.

### Task 3: Build cross-platform preview artifacts in CI

**Files:**
- Create: `.github/workflows/desktop-build.yml`

- [x] Add a workflow triggered by manual dispatch and version tags `desktop-v*`.
- [x] Use a macOS runner for `npm ci`, stable Rust setup, and `npm run desktop:build -- --bundles app`; create the DMG without Finder GUI automation and upload it with the app bundle as workflow artifacts.
- [x] Use a Windows runner for `npm ci`, stable Rust setup, and `npm run desktop:build -- --bundles nsis`; upload the generated setup executable as a workflow artifact.
- [x] Do not configure signing secrets or publish a GitHub Release in this workflow. Label outputs as unsigned preview artifacts.
- [x] Fail clearly when platform packaging fails; retain build logs in the workflow output.

### Task 4: Document setup and commercial release requirements

**Files:**
- Modify: `README.md`

- [x] Add desktop development prerequisites: Node.js, Rust toolchain, and platform-specific build tools.
- [x] Document `npm run desktop:dev`, `npm run desktop:build`, and `npm run build:desktop`.
- [x] Explain that desktop document processing stays local, analytics and remote assistant are disabled, and OCR engine assets may still be downloaded separately from source documents.
- [x] Explain how CI produces unsigned macOS DMG and Windows NSIS preview artifacts.
- [x] State that direct public Mac distribution outside the App Store needs Developer ID signing and notarization, and that public Windows distribution needs a trusted signing/Store path; do not imply this pilot includes those credentials.
- [x] List the excluded firm workspace features so the pilot is not presented as a Dext replacement.

### Task 5: Build and exercise the desktop flow

**Files:**
- No additional files unless a build issue requires a focused fix.

- [x] Run `npm run build` and confirm the current web build still succeeds.
- [x] Run `npm run build:desktop` and confirm the desktop-mode frontend bundles successfully.
- [x] Run `npm run desktop:build -- --bundles app` on macOS and confirm the `.app` is produced; package it as a DMG without Finder GUI automation and confirm both artifacts exist. The Tauri DMG bundler's Finder layout script stalled locally, so the app bundle was packaged with Tauri's bundled DMG helper using `--skip-jenkins`.
- [ ] Open the desktop app, load the built-in synthetic statement, review its converted result, and save an XLSX through the native Save dialog.
- [x] Inspect the desktop build output and confirm it contains neither the Vercel Analytics component nor the `/api/agent/` endpoint; source guards also disable both paths in desktop mode.
- [ ] Confirm the Windows CI job produces the NSIS installer artifact; do not claim Windows runtime validation until the installer is exercised on Windows.

Builds completed on macOS arm64 on 2026-10-20. The `.app` and DMG were produced; the generated executable is Mach-O arm64 and the artifacts are unsigned. The web and desktop Vite builds retain the existing advisory about large JavaScript chunks. Runtime Save-dialog behavior, the synthetic conversion flow inside the desktop window, static bundle privacy inspection, GitHub Actions execution, and Windows artifacts remain unverified. The Rust dependency lockfile was committed as `eecee48`.

## Self-review

- All v1 requirements map to Tasks 1–5.
- Web behavior remains isolated from desktop-only code using Vite mode.
- The filesystem write path is user-selected and does not grant broad directory access.
- Windows verification is explicitly separated from a successful macOS build.
- Signing, release publication, account management, sync, billing, and firm integrations remain out of scope.
