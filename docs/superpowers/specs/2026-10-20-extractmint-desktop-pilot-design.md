# ExtractMint desktop pilot design

## Goal

Package the existing ExtractMint converter as installable macOS and Windows desktop apps for a first accountant pilot, reusing its current extraction, review, and export code.

## V1 scope

- Build a single-user, local-first desktop app from the existing React and Vite frontend with Tauri 2.
- Keep the current import, protected-PDF password prompt, OCR, review/edit, and export flows.
- Save exports through the operating system's Save dialog so users choose where accounting files are written.
- Keep uploaded documents and extracted rows on the user's computer. The desktop build must not send analytics events or make remote assistant requests.
- Keep current browser OCR behavior. OCR language assets may be fetched as static engine data; document bytes and extracted text must never be sent with those requests.
- Preserve the current web app and its analytics and assistant behavior in its web build.
- Produce macOS and Windows preview installers from CI. The first preview may be unsigned; signed/notarized commercial distribution requires the owner's signing credentials and store accounts.

## Out of scope

- Firm/client accounts, team access, cloud sync, hosted document storage, billing, licensing, auto-update, accounting-software API integrations, and item-by-item receipt extraction.
- Changing extraction rules or making accountant-grade accuracy claims.
- Publishing an installer to an app store or publicly releasing a signed build.

## Architecture

Tauri 2 hosts the existing Vite application from bundled local assets. The desktop build uses a dedicated Vite mode so desktop-only privacy and file-save behavior can be selected at compile time without changing the web release. Keep Tauri permissions narrow: the app may open the existing browser-style file picker and write only to a path selected by the user in a Save dialog. No general filesystem access is needed.

The desktop build omits Vercel Analytics and prevents the `/api/agent/` request path. The web build continues to include those existing features. Local OCR caches and settings continue using the current browser storage APIs inside the desktop WebView.

## User flow

1. The user opens ExtractMint from the macOS app or Windows installer.
2. The user selects or drops statement and receipt files into the existing converter.
3. Extraction, password handling, review, and correction happen inside the app.
4. The user chooses an export format and location in a native Save dialog; the app writes the generated file there.

## Distribution

- macOS: build an app bundle and DMG on a macOS runner.
- Windows: build an NSIS setup executable on a Windows runner.
- CI stores both as downloadable preview artifacts.
- Production distribution is a separate release step: macOS direct downloads need Developer ID signing and notarization; public Windows distribution needs a trusted signing or Store route. Secrets must not be committed to the repository.

## Acceptance criteria

1. The existing web build still builds with web analytics and assistant behavior unchanged.
2. Desktop builds package the Vite app locally and expose no remote assistant request or Vercel analytics component.
3. A user can select a supported file, process it, review it, and save an export to a path chosen in the native Save dialog.
4. Protected PDFs retain the existing inline password and retry behavior without sending or persisting passwords remotely.
5. CI defines macOS and Windows packaging jobs and uploads the resulting preview installers.
6. Documentation distinguishes local document processing from signing/notarization requirements and describes that v1 does not include firm accounts, sync, billing, or software integrations.

## Verification

- Run the existing production web build and a desktop-mode Vite build.
- Build the macOS Tauri bundle locally when Rust and platform prerequisites are available.
- Use CI's Windows runner to build the Windows installer; a macOS-only local build does not establish Windows runtime behavior.
- Manually exercise the synthetic statement through import, review, and native export in the desktop app.
- Inspect the desktop bundle's generated configuration and app code paths to confirm analytics and remote assistant are excluded.
