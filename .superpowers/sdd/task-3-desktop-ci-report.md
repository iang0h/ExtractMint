# Task 3 report: Desktop preview build workflow

## Change

Added `.github/workflows/desktop-build.yml` with independent macOS and Windows jobs. The workflow runs on manual dispatch and pushes of tags matching `desktop-v*`. Each job checks out the source, installs Node.js 24 and stable Rust, runs `npm ci`, and invokes the platform-specific desktop bundling command from the approved plan.

The macOS job builds the `.app` bundle, then creates an unsigned DMG with `hdiutil` from a staging folder containing the app and an `/Applications` symlink. This avoids the Tauri DMG bundler's Finder GUI automation. The DMG and a tar archive containing the `.app` bundle are uploaded as separate artifacts; the tar preserves bundle file permissions through artifact download. The Windows job uploads the NSIS setup executable. Artifact names identify these as unsigned previews, and each artifact is retained for 14 days. The workflow has only `contents: read` permissions, does not persist checkout credentials, and has no signing, notarization, release, deployment, or secrets configuration.

## Action versions

- `actions/checkout@v7.0.1` — current release verified on the official [actions/checkout releases page](https://github.com/actions/checkout/releases/latest).
- `actions/setup-node@v7.1.0` — current release verified on the official [actions/setup-node releases page](https://github.com/actions/setup-node/releases/latest).
- `actions/upload-artifact@v7.0.2` — current release verified on the official [actions/upload-artifact releases page](https://github.com/actions/upload-artifact/releases/latest).
- `dtolnay/rust-toolchain@stable` — follows the stable channel selector shown in the action’s official [workflow usage](https://github.com/dtolnay/rust-toolchain#example-workflow).

## Static inspection

Confirmed the workflow source contains both triggers, one macOS and one Windows hosted job, Node.js 24 setup, stable Rust setup, and `npm ci`. The macOS job bundles the app, then uses `hdiutil create` to produce a DMG with an Applications symlink; the Windows job retains the exact NSIS command from the task brief. Confirmed DMG, `.app` tar archive, and `.exe` paths are uploaded as separate unsigned preview artifacts with missing outputs treated as errors. The `.app` tar packaging follows the upload action's documented guidance for preserving file permissions. No Windows workflow steps were changed in this follow-up.

No tests, builds, or CI execution were performed. CI execution remains pending until this workflow is committed to the repository and triggered on GitHub Actions.
