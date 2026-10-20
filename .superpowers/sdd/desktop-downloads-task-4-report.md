# Task 4 report: public release and owner setup

## Status

Completed and committed README documentation in `d6f0281` (`docs: explain signed desktop release workflow`). The existing privacy and extraction-scope statements were left intact.

## Self-review

- Distinguished temporary unsigned `desktop-v*` CI artifacts from public signed downloads.
- Documented the public page URL, owner-selected semantic version matching across the four checked version files, the `extractmint-vX.Y.Z` tag, exact GitHub secret names, draft review and manual publishing, manifest update on the default branch, and Vercel deployment from that branch.
- Documented Developer ID signing and Apple notarization requirements, the SmartScreen reputation caveat, and that installers are not ready until secrets are configured and a signed release is verified.
- Kept the existing local processing, OCR asset, and receipt line-item extraction scope language unchanged.

## Verification

- `npm run build`: passed.
- Inspected `dist/desktop/index.html`, `dist/desktop/downloads.json`, `dist/sitemap.xml`, `dist/index.md`, and `dist/llms.txt`. The desktop page and SEO listings are present; the manifest remains disabled (`available: false`).
- `git diff --check -- README.md`: passed.
- Requested whole-worktree `git diff --check`: reports a pre-existing trailing blank line at EOF in `.superpowers/sdd/task-3-brief.md`; this unrelated file was not changed by this task.
- No test suites were run.

## Concerns

The public release still requires owner-selected version alignment and GitHub secrets, then a verified signed release. No installer availability is claimed. Existing unrelated changes in `.superpowers/sdd/progress.md`, `.superpowers/sdd/task-3-brief.md`, and `.superpowers/sdd/task-4-brief.md` remain uncommitted.

## Follow-up review fix

Restored the instruction to download unsigned preview artifacts from the completed GitHub Actions workflow run, while retaining the statement that these are temporary previews rather than public signed downloads. `git diff --check -- README.md` passes. The requested whole-worktree `git diff --check` still reports the same pre-existing trailing blank line in `.superpowers/sdd/task-3-brief.md`. No tests were run.
