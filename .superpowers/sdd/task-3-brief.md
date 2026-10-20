# Desktop pilot Task 3: Build unsigned preview artifacts in CI

Read the approved desktop pilot plan at `docs/superpowers/plans/2026-10-20-extractmint-desktop-pilot.md` and check current repository conventions before editing.

## Scope

Create `.github/workflows/desktop-build.yml` so GitHub Actions can produce separate macOS DMG and Windows NSIS unsigned preview artifacts.

## Requirements

- Trigger manually with `workflow_dispatch` and on tags matching `desktop-v*`.
- Provide independent macOS and Windows jobs using GitHub-hosted runners.
- Each job checks out the repository, installs Node.js 24, sets up stable Rust, runs `npm ci`, then runs the matching command:
  - macOS: `npm run desktop:build -- --bundles app`; create the DMG from the app bundle with `hdiutil` or the Tauri helper, skipping Finder GUI automation so the runner cannot hang while arranging icons.
  - Windows: `npm run desktop:build -- --bundles nsis`
- Upload the generated macOS DMG and `.app` bundle, and the Windows setup executable, as workflow artifacts. Use separate artifact names and sensible retention.
- Name/describe artifacts as unsigned previews. Do not sign, notarize, create releases, deploy, or configure secrets.
- Static review follow-up: use the `app` bundle target plus `hdiutil` packaging to avoid Finder GUI automation on CI runners.
- Use current action versions verified from official GitHub sources; keep workflow permissions minimal and read-only.
- Do not edit application source, package manifests, Tauri config, or README in this task.

## Constraints

- Do not run tests or build commands. The parent agent will build the local app after CI and documentation are complete.
- Do not push branches or tags.
- Do not claim CI ran; only author the workflow.

## Completion

- Inspect the final workflow source for correct triggers, job platforms, build commands, artifact paths, names, and permissions.
- Run `git diff --check` only if needed for whitespace; no tests/builds.
- Commit only `.github/workflows/desktop-build.yml` and this report at `.superpowers/sdd/task-3-desktop-ci-report.md`.
- In the report, list the change, action versions, static inspection, and explicitly state that no build or CI execution was performed.
