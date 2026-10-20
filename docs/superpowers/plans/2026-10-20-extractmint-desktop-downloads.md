# ExtractMint Desktop Downloads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a discoverable ExtractMint desktop page and a signed-release pipeline that reveals Mac and Windows downloads only after an owner publishes a verified release.

**Architecture:** Serve `/desktop/` as a static SEO page. It reads a same-origin JSON manifest and builds fixed GitHub release asset URLs only when that manifest names a valid release tag. GitHub Actions builds and signs draft releases; a separate `release.published` workflow validates the release event and updates the manifest on the default branch, allowing the existing Vercel Git integration to deploy the new state.

**Tech Stack:** React/Vite homepage, static HTML/Markdown SEO artifacts, Node.js scripts, Tauri v2, GitHub Actions, macOS signing/notarization, Windows Authenticode signing, Vercel Git deployments.

## Global Constraints

- The desktop page says signed desktop downloads are being prepared until a signed public release is published.
- Public asset names are exactly `ExtractMint-macOS-universal.dmg` and `ExtractMint-Windows-x64-setup.exe`.
- Release tags follow `extractmint-v<package version>` and all four version declarations (package.json, package-lock root package, src-tauri/Cargo.toml, src-tauri/tauri.conf.json) must match; the manifest version must equal the release tag's version suffix.
- Mac releases are universal for Apple Silicon and Intel, Developer ID signed, and notarized.
- Windows releases are x64 NSIS installers signed with a trusted certificate; a SmartScreen warning may still appear while reputation builds.
- Missing signing credentials fail the release before assets are published. There is no unsigned public fallback.
- Signing certificates, passwords, and tokens stay in GitHub Actions secrets and never enter source control or chat.
- Keep the existing unsigned preview workflow on `desktop-v*` tags separate from public releases on `extractmint-v*` tags.
- Do not change document extraction, OCR, analytics, assistant, or storage behavior, and do not add accounts, sync, billing, licensing, or new processing capabilities.

---

### Task 1: Add the desktop downloads page and discoverability links

**Files:**
- Create: `public/desktop/index.html`
- Create: `public/desktop/index.md`
- Create: `public/desktop/downloads.json`
- Modify: `src/App.tsx` (primary navigation and footer)
- Modify: `public/sitemap.xml`
- Modify: `public/index.md`
- Modify: `public/llms.txt`

**Interfaces:**
- Manifest schema: `{"available":false,"version":null,"releaseTag":null,"publishedAt":null}`. The publish workflow later sets `available` to `true` and fills the other three fields.
- The page reads `/desktop/downloads.json`. It constructs download URLs only for the two exact asset names and a tag matching `^extractmint-v\d+\.\d+\.\d+$`; the manifest version must equal the tag's version suffix.

- [ ] Add the initial disabled manifest at `public/desktop/downloads.json` with the schema above, formatted as JSON with a trailing newline.
- [ ] Create `public/desktop/index.html` using `/seo.css`, a canonical URL of `https://extractmint.iangoh.com/desktop/`, and a `WebPage` JSON-LD entry. Use the existing `.page`, `.nav`, `.brand`, `.hero`, `.panel`, `.grid`, `.button`, and `.footer` styles. Page copy: eyebrow `ExtractMint Desktop`; heading `Your documents stay on your computer.`; lede explaining that the local-first Mac and Windows app reuses ExtractMint’s conversion, review, and export workflow; status `Signed desktop downloads are being prepared.`; primary action `Use the browser converter` linking to `/#converter`; and a short note that no desktop installer is available yet. Include Mac and Windows platform cards inside a hidden `#desktop-downloads` container, with links `#download-macos` and `#download-windows`, both initially without `href`. Keep the download container hidden using a page-local `[hidden] { display: none !important; }` rule.
- [ ] Add a page-local script that fetches `/desktop/downloads.json` with `cache: "no-store"`; on any fetch, parse, schema, or tag error, leave the prepared status and hidden download container unchanged. When `available === true`, `version` is a string, `releaseTag` matches the specified pattern, `releaseTag === "extractmint-v" + version`, and `publishedAt` is a string, set the two anchors’ `href` values to `https://github.com/iang0h/ExtractMint/releases/download/${encodeURIComponent(releaseTag)}/ExtractMint-macOS-universal.dmg` and the matching Windows `.exe` path, set `rel="noopener"`, update the status to identify the published version, and reveal the download container. Do not interpolate any other manifest value into HTML.
- [ ] Create `public/desktop/index.md` with the same product scope, local-processing description, current preparation status, browser converter link, and a note that signed installers will appear after publication.
- [ ] Add `<a href="/desktop/">Desktop app</a>` to the homepage primary navigation and footer in `src/App.tsx`.
- [ ] Add `https://extractmint.iangoh.com/desktop/` to `public/sitemap.xml` with lastmod `2026-10-20`; add the HTML and Markdown page URLs to the existing key-page and markdown-mirror sections in `public/index.md` and `public/llms.txt`.
- [ ] Inspect the files and generated page after `npm run build`; confirm the initial manifest keeps downloads hidden and the browser converter link is present. Do not run test suites.

### Task 2: Add the fail-closed signed release workflow

**Files:**
- Create: `.github/workflows/desktop-release.yml`
- Create: `scripts/check-desktop-release-version.mjs`
- Modify: `src-tauri/tauri.conf.json` only if needed to set Windows signing defaults `digestAlgorithm: "sha256"` and a timestamp URL; keep the actual certificate thumbprint runtime-only.

**Interfaces:**
- `node scripts/check-desktop-release-version.mjs <tag>` exits successfully only when the tag is `extractmint-vX.Y.Z` and the version matches `package.json`, `package-lock.json` root package, the `[package]` version in `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.
- Workflow trigger: push tags matching `extractmint-v*`. Existing `desktop-v*` preview behavior remains untouched.
- Required GitHub Actions secrets: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`, `KEYCHAIN_PASSWORD`, `WINDOWS_CERTIFICATE`, and `WINDOWS_CERTIFICATE_PASSWORD`.

- [ ] Implement the version checker using Node built-ins only: parse the two JSON files, extract the `[package]` version from Cargo.toml, read the Tauri config version, validate the tag against `^extractmint-v\d+\.\d+\.\d+$`, and fail with a message naming only the mismatched file/field. Do not print secret values.
- [ ] Create `.github/workflows/desktop-release.yml` with read permission for build jobs and `contents: write` only for the final draft-release job. Run a preflight job that invokes the version checker and checks every required secret is non-empty; print missing secret names only and stop before either platform build.
- [ ] Add a macOS build job on `macos-latest`: install Node 24 and stable Rust, add `aarch64-apple-darwin` and `x86_64-apple-darwin` targets, import the base64 `APPLE_CERTIFICATE` into a temporary keychain, set `APPLE_SIGNING_IDENTITY` from the imported Developer ID identity, and run `npm ci` followed by `npm run desktop:build -- --bundles dmg --target universal-apple-darwin` with `APPLE_ID`, `APPLE_PASSWORD`, and `APPLE_TEAM_ID` available to Tauri notarization. Verify the app with `codesign --verify --deep --strict`, verify the stapled notarization with `xcrun stapler validate`, check both CPU architectures with `lipo -archs`, and rename the sole generated DMG to `ExtractMint-macOS-universal.dmg`. Upload it as a one-day workflow artifact; fail when the expected output is absent or ambiguous.
- [ ] Add a Windows build job on `windows-latest`: import the base64 PFX from `WINDOWS_CERTIFICATE` with `WINDOWS_CERTIFICATE_PASSWORD`, read its thumbprint, generate `src-tauri/tauri.windows-release.conf.json` containing `bundle.windows.certificateThumbprint`, `digestAlgorithm: "sha256"`, and `timestampUrl: "http://timestamp.digicert.com"`, then run `npm ci` and `npm run desktop:build -- --bundles nsis --config src-tauri/tauri.windows-release.conf.json`. Require exactly one NSIS `.exe`, verify its Authenticode signature status is `Valid`, rename it to `ExtractMint-Windows-x64-setup.exe`, remove the temporary certificate/config files, and upload the installer as a one-day workflow artifact.
- [ ] Add a final job that waits for both platform jobs, downloads both artifacts, and creates a GitHub **draft** release for the triggering tag with exactly the two stable asset names. Do not publish the draft from automation; owner review and publication remain manual.
- [ ] Inspect the workflow text to confirm secret references occur only through `${{ secrets.* }}`, the preview workflow is unchanged, all build/sign/verification failures prevent draft asset creation, and no unsigned fallback exists. Do not trigger a release tag during implementation.

### Task 3: Publish the manifest only for a complete public release

**Files:**
- Create: `.github/workflows/desktop-release-published.yml`
- Create: `scripts/update-desktop-downloads-manifest.mjs`

**Interfaces:**
- The workflow runs only for the GitHub `release.published` event and grants `contents: write`.
- The script consumes the event JSON path in `GITHUB_EVENT_PATH`, requires a non-draft, non-prerelease release with a valid `extractmint-vX.Y.Z` tag and both exact installer asset names, and writes the Task 1 manifest schema with `available: true`, the tag-derived version, and the event’s `published_at` value.

- [ ] Implement the updater with Node built-ins only. Validate `release.draft === false`, `release.prerelease === false`, the tag pattern, both exact `release.assets[].name` values, and a parseable `published_at`; fail without modifying the manifest if any check fails. Write formatted JSON and a trailing newline.
- [ ] Create `.github/workflows/desktop-release-published.yml` for `release: types: [published]`; check out `github.event.repository.default_branch`, run the updater against `GITHUB_EVENT_PATH`, and commit/push only when `public/desktop/downloads.json` changed. Set the commit author to `github-actions[bot]`; do not add a skip-deploy marker because the Vercel Git deployment must see the manifest update.
- [ ] Inspect that draft creation, prerelease publication, malformed tags, or missing assets cannot enable downloads, and that the workflow contains no signing credentials.

### Task 4: Document the public release and owner setup

**Files:**
- Modify: `README.md`

**Interfaces:**
- Keep the current preview-build instructions but distinguish them clearly from signed public releases.
- Document the desktop page URL, release tag/version procedure, exact GitHub secret names from Task 2, draft-review/publish sequence, automatic manifest update, and the SmartScreen reputation caveat.

- [ ] Update the “Unsigned CI previews and public distribution” section to explain that `desktop-v*` artifacts are temporary unsigned previews and never public downloads; `extractmint-v*` tags create signed draft releases; owners publish a draft after reviewing both assets; publishing updates the website manifest and Vercel deploys from the default branch.
- [ ] Document that the first release requires one matching semantic version in all four version files, that no version should be guessed during this implementation, and that secrets must be configured in GitHub repository/environment secrets using these exact names: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`, `KEYCHAIN_PASSWORD`, `WINDOWS_CERTIFICATE`, and `WINDOWS_CERTIFICATE_PASSWORD`.
- [ ] State that macOS distribution requires Developer ID signing and notarization, and signed Windows downloads can still show SmartScreen warnings while reputation accumulates. Keep existing desktop privacy and extraction-scope statements intact.
- [ ] Run `npm run build`, inspect `dist/desktop/index.html`, `dist/desktop/downloads.json`, `dist/sitemap.xml`, `dist/index.md`, and `dist/llms.txt`, then review `git diff --check`. Do not add or run test suites. Do not claim installers are ready until owner secrets are configured and a signed release has been verified.

## Self-review

- **Spec coverage:** Page and links (Task 1); disabled manifest and download gating (Tasks 1 and 3); separate signed workflow and unsigned preview (Task 2); reviewed draft releases (Task 2); manifest publication after signed assets are public (Task 3); SEO artifacts (Task 1); privacy/scope constraints (Tasks 1 and 4); signed artifact verification and missing-secret failures (Task 2); external credential prerequisites (Task 4).
- **Placeholder scan:** No TODO, TBD, or unspecified implementation steps remain. The release version intentionally remains owner-selected and is not invented by this plan.
- **Interface consistency:** The updater writes the same four manifest keys created in Task 1; the public page consumes `available`, `version`, `releaseTag`, and `publishedAt` and enforces version/tag equality; release assets use the exact names required by the spec; tag validation agrees across the release checker, updater, and page.
