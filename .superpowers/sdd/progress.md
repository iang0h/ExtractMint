# ExtractMint product-first redesign progress

- Task 1: complete — implementation `ee8555d`, review fix `0ed29b5`; spec and quality review approved.
- Task 2: complete — implementation `6660db5`; task review approved; anchors, pricing link, input accept, and settings/disclosure locations confirmed.
- Task 3: complete — styling `8b55f39`, accessible export label `1578af8`; spec and quality review approved after focused fix.
- Task 4: complete — `a6dd1d1`; spec and quality review approved; final visual QA remains in Task 5.
- Task 5: complete — `dc3a07e`; focused review approved; production build and responsive/workflow QA recorded. Reduced-motion/WebGL-disable runtime emulation unavailable.
- Task 6: complete — `d6f6ce9`, one-wrapper fix `8a35d90`; hero CSS field renders before the optional shader import; build emits a separate TopoFieldBackdrop chunk.
- Final branch review: complete — the broad review's eager shader loading finding was fixed with deferred import, and the focused review of `d6f6ce9..8a35d90` approved the one-wrapper fallback. The fresh root production build passes and emits a separate `TopoFieldBackdrop` chunk. Reduced-motion/WebGL-disable runtime emulation remains unverified in the in-app browser.

# ExtractMint statement benchmark progress

- User authorized the first build slice: an offline benchmark using synthetic statement PDFs.
- Implementation base commit: `1a88627`.
- Task 1: complete — implementation `fb1d016`; independent spec and quality review clean.
- Task 2: complete — implementation `9b9f448`, review fixes `8eb535e` and `ca4bd73`; focused reviews clean. Synthetic run: 6/6 matched, all scored fields exact, both balances valid.
- Task 3: complete — implementation `590dce4`; independent review clean. Fresh verification: benchmark 6/6 matched, build/lint pass, and a deliberate amount mismatch exits 1 with fixture restored.

# ExtractMint evidence-led demo progress

- Task 1: complete — shared renderer, reproducible synthetic sample PDF, generation command, and focused checks committed as `273952a`; task review passed. Benchmark matched 6/6 rows through the real converter.
- Task 2: complete — browser sample conversion, privacy-disclosed sample analytics, and upload-precedence race fix committed as `a4c2033` and `256ee03`; task review approved after the focused race fix. Sample mode keeps OCR settings unchanged, runs the fixture through the real converter, and produces five parsed rows with a validated balance trail.
- Task 3: complete — evidence-led guide, bank-page redirects, discovery cleanup, and SearchAction removal committed as `26109d6`; spec and quality review approved. Local tests, build, and lint passed; production HTTP redirects remain for Task 4 verification.
- Task 4: complete — fresh checks and local browser sample conversion passed; production deployment `dpl_A7H5vTs82Nw5SpvaSjsuccec8Dsn` is READY at `https://extractmint.iangoh.com`. Live sample PDF, guide canonical, sitemap, `llms.txt`, and all three 308 redirects were verified. The live sample produced five rows, three matched balance transitions, and a $0 discrepancy. Vercel Analytics is enabled; the dashboard showed 3 visitors, 4 page views, and one each of `sample_conversion_started` / `sample_conversion_completed` over the last 7 days, including QA traffic. `upload_started`, `conversion_completed`, and `export_started` are wired with event names only and will populate as visitors use those paths. Google Search Console confirms the recrawl request is queued; no indexing or ranking result is claimed. The Vercel aggregation API returned inconsistent empty/not-found responses while the dashboard showed data, so the dashboard is the current source of truth.

# ExtractMint clean converter workspace progress

- Task 1: complete — removed the preloaded sample, hides completed-state exports until a result is ready, and keeps progress/password states visible; commits `4a8e9b0`, `d2579bb`, and `8c113bf`; focused state review passed.
- Task 2: complete — primary Excel flow, collapsible secondary exports/settings/privacy/support, linked privacy note, and processing-state balance gate; commits `df4a8f1`, `cbd9b17`, `8141f9c`, and `45e985d`; spec and quality review passed.
- Task 3: complete — responsive disclosure, sample, Excel, and secondary-export styling with keyboard focus and 42px review-pack checkbox target; commits `b80cdca`, `86202fa`, `0267772`, `cd85f22`, `f8afd64`, and `1a84174`; focused CSS reviews passed.
- Task 4: complete — the production build passes; the converter was visually checked at 390px, 747px, and desktop, including the synthetic sample review state, primary Excel action, and visible keyboard focus. A full branch review passed with one P3 polish finding; that disabled-button styling was fixed and the focused CSS re-review passed. No test suite was run. The final preview reconnect timed out after the CSS-only fix, so that state was verified by source review. The build retains the existing large-chunk advisory. No production deployment was performed.

# ExtractMint receipt extraction progress

- Task 1: complete — parser implementation `9e73309`; follow-up commits `bd22a83`, `186cd9f`, `d89d41c`, `db1a280`, `c3d39b4`, `984bb1a`, `ec008ca`, `13cf57b`, `e3c75b7`, `5754a68`, `bb2b50a`, `8b02c84`, `fd3c138`, `8d5a695`, `bc6ee80`; final independent spec and quality review approved at `bc6ee80`. Source review and `git diff --check` only; no automated tests were added or run, per developer instruction.
- Task 2: complete — receipt review UI, currency confirmation, local image preview, responsive fields, and `/api/agent` receipt-data guard committed as `30392ba`; independent static spec and quality review approved. Build/browser verification is deferred to Task 4; no tests were run.
- Task 3: complete — single and batch receipt XLSX/CSV exports committed as `c763528`; independent static spec and quality review approved. Build verification is deferred to Task 4; no tests were run.
- Final follow-up fixes: complete — whole-branch review findings were addressed across `23a5436` through `a6aaeb3`, including statement-vs-receipt routing, payable totals, currency headers, tax boundaries, and base-first tax calculations. The focused review of `a6aaeb3` and final independent whole-branch review both approved with no remaining actionable findings.
- Task 4: complete — fresh `npm run build` exited 0; Vite retains its large-chunk advisory. `git diff --check` passes. Static source review confirmed statement handling and exports remain intact, receipt metadata stays out of analytics and `/api/agent/`, and receipt review/export paths follow the spec. No tests were added or run, per developer instruction. Browser OCR and generated workbook runtime behavior were not independently exercised. No deployment was performed.

# ExtractMint desktop pilot progress

- Design and implementation plan complete; scope: local-first Tauri desktop wrapper, native export save dialog, web behavior preserved, no desktop analytics or remote assistant.
- Worktree ready at `.worktrees/clean-converter-workspace` on branch `codex/receipt-extraction`.
- Task 1: complete — Tauri shell, desktop build mode, relative assets, scoped Save-dialog capability, platform icons, and desktop scripts; commits `a5549b5` and `7a5b798`; independent spec and quality review approved after the strict-port fix. Native compilation was deferred at that checkpoint and completed in Task 5.
- Task 2: complete — desktop-only analytics and remote assistant are disabled, all generated exports use the native Save dialog and selected-path write, browser download behavior and support clipboard copy are preserved, and redaction PNG save errors have a dedicated accessible status; implementation `5ab4021`, clarity fix `54aad12`; independent review approved with no remaining issues. No tests, builds, or runtime checks were run; native dialog and write behavior remain unverified.
- Task 3: complete — GitHub Actions builds macOS DMG/app and Windows NSIS unsigned preview artifacts on manual dispatch or `desktop-v*` tags; implementation `bb44d00`, Finder-free packaging follow-up `5388ed7`; independent reviews approved. CI has not been triggered, and Windows runtime remains unverified.
- Task 4: complete — README covers desktop prerequisites/commands, local-processing and OCR asset boundaries, unsigned CI artifacts, direct-distribution signing requirements, and excluded firm features; implementation `b13550b`, wording correction `565cb8b`; independent review approved. No tests or builds were run for the documentation task.
- Task 5: partial — `npm run build`, `npm run build:desktop`, and `npm run desktop:build -- --bundles app` succeeded on macOS arm64. A 4.7 MB unsigned DMG was created using Tauri's bundled DMG helper with Finder automation skipped; the `.app` is 13 MB and contains an arm64 Mach-O executable. The regular Tauri DMG command stalled while arranging icons in Finder, which is why CI was changed to build the app and use `hdiutil` directly. Existing large-chunk advisories remain. Static inspection of desktop JavaScript found no Vercel Analytics module or `/api/agent/` endpoint. The runtime save-dialog flow, synthetic conversion inside the app, CI execution, and Windows installer remain unverified. Rust dependencies were locked in `eecee48`.
