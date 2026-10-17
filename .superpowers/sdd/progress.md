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
