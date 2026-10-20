# ExtractMint desktop downloads design

## Goal

Make the local-first ExtractMint desktop app easy to find from the website and provide dependable public Mac and Windows downloads after signed releases are ready.

## User-facing design

- Add a dedicated `/desktop/` page linked from the homepage navigation and footer.
- Keep the page visually consistent with existing ExtractMint public pages: quiet background, dark teal text, restrained green accents, simple platform cards, and clear language.
- Explain that the Mac and Windows apps process documents locally and reuse the existing conversion, review, and export flows.
- Until the first signed release is published, show an explicit “Signed desktop downloads are being prepared” status and a link to use the browser converter. Do not show broken download buttons or link to temporary CI artifacts.
- Keep the initial release manifest at `public/desktop/downloads.json` with availability disabled. The page reads this same-origin file and shows download buttons only when the manifest identifies a published release tag.
- When a GitHub Release is published, a small release-published workflow updates the manifest on the Vercel production branch. Vercel's normal Git deployment then updates the page without requiring a manual code edit. At implementation time that branch is `codex/receipt-extraction`.
- After a signed public release exists, show links to that release's macOS universal DMG and Windows x64 installer. Use stable asset names `ExtractMint-macOS-universal.dmg` and `ExtractMint-Windows-x64-setup.exe`; include the explicit release tag in each URL.
- Add the page to `sitemap.xml`, `public/index.md`, and `public/llms.txt` so it can be found by crawlers and assistants.

## Release workflow

- Keep the existing unsigned preview workflow distinct from public releases.
- Add a release workflow for version tags `extractmint-v*` that builds a macOS universal DMG and a Windows x64 NSIS installer, code signs both, and notarizes the macOS app.
- Publish the signed installers as assets on a GitHub Release, using stable names `ExtractMint-macOS-universal.dmg` and `ExtractMint-Windows-x64-setup.exe`.
- Create each GitHub Release as a draft for owner review. Publishing that release triggers the manifest update, so the website reveals download buttons only after the release and its signed assets are public.
- Store signing credentials only in the `desktop-signing` GitHub Actions environment or repository secrets. The workflow must stop with a clear message when required secrets are absent and must never fall back to an unsigned public release.
- macOS signing uses a Developer ID Application identity and Apple notarization credentials. Windows signing uses a trusted signing certificate/service configured for the Tauri bundle. Signed Windows builds may still show SmartScreen warnings until reputation accumulates.

## Privacy and scope

- Do not change extraction, OCR, analytics, assistant, or document-storage behavior.
- Do not upload unsigned CI artifacts to the website or claim the apps are ready before a signed release is published.
- Do not add app accounts, cloud sync, billing, licensing, auto-update, or new document processing capabilities.
- Do not place certificates, passwords, private keys, or signing tokens in source control or in chat.

## Acceptance criteria

1. The website homepage and footer link to `/desktop/`.
2. The page clearly communicates the current availability state and has no dead download links before a release exists.
3. Before a release is published, the downloads page shows no installer links. After publication, the manifest update causes the page's Mac and Windows download links to point to that release's assets.
4. The release workflow creates a universal macOS DMG that is Developer ID signed and notarized, plus a signed Windows x64 NSIS installer.
5. The release workflow cannot publish unsigned artifacts as a fallback and fails clearly when signing configuration is incomplete.
6. SEO artifacts list the new `/desktop/` page.
7. Existing web conversion and desktop preview builds remain unchanged.

## Verification

- Run the existing site build and inspect the generated `/desktop/` page and crawl artifacts.
- Validate the release workflow syntax and check that required secrets are referenced only through GitHub's secret context.
- A successful signed release must be verified on macOS Gatekeeper/notarization status and Windows signature metadata before making the release public.
- Do not claim signed installation readiness until credentials are supplied and signed platform artifacts have been inspected.

## External prerequisites

- Apple Developer ID Application signing certificate, Apple account notarization access, and the associated team identifier.
- A current, trusted Windows code-signing certificate or signing-service account configured for automated GitHub Actions signing.
- These credentials need to be added by the repository owner in GitHub repository or environment secrets. No secret values are required in the conversation.
