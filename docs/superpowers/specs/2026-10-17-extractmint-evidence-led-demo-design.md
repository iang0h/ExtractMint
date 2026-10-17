# ExtractMint evidence-led sample demo and guide

## Context

ExtractMint's primary domain is now the canonical site and its homepage is indexed, but Google last crawled it before the canonical migration. Search Console shows only three impressions and no clicks for the current three-month baseline. The live app starts with a static sample result (`createSampleResultLite`); visitors cannot run that sample through the actual PDF parser. The site also has three bank-specific landing pages that explicitly say their formats have not been independently validated.

Competitors make sample outputs, supported formats, and validation visible. ExtractMint should build trust with a repeatable, inspectable sample rather than unsupported bank-coverage or accuracy claims.

## Goal

Let visitors run invented statement data through the real browser converter, explain how to review its output, and consolidate unvalidated bank-specific search pages into one useful canonical guide.

## Design

### Synthetic sample

- Generate one digital PDF from the existing English fixture in `benchmarks/statements/fixtures.mjs` using the same PDF-generation helper as the offline benchmark.
- Store the reproducible asset at `public/samples/synthetic-bank-statement.pdf`. It contains only invented names, references, and amounts and visibly identifies itself as synthetic.
- Add a “Try the synthetic sample” action next to the existing upload control. Fetch that public asset, wrap it as a `File`, then pass it through the same `processFiles` and `convertFiles` path used for user files.
- Do not let the sample count as a user upload or a real conversion. Track `sample_conversion_started`, `sample_conversion_completed`, `sample_conversion_failed`, and `sample_conversion_cancelled` separately, with event names only. If a real upload supersedes a pending sample, close the sample attempt with the cancellation event.
- Keep the sample workflow browser-side. On an asset fetch or conversion error, show the existing progress error state and keep user-upload behavior unchanged.
- Offer a download link to the synthetic PDF so visitors can inspect the input themselves.

### Search landing page

- Expand `/convert/bank-statement-to-excel/` into the single primary guide for the workflow.
- Show the synthetic sample ledger and its arithmetic: opening balance 1,000.00 + deposits 300.00 - withdrawals 125.50 - 62.00 = closing balance 1,112.50. Label every sample figure as invented.
- Explain the real review sequence: check the date and statement period, descriptions and references, debit/credit direction, running balances, and final reconciliation before accounting use.
- State supported outputs and the exact boundaries of the synthetic benchmark. Do not claim bank-specific validation, real-world accuracy, or that OCR will always work.
- Explain browser-side file processing and link to the privacy page for the optional Ask ExtractMint data flow.
- Include one CTA that scrolls directly to the synthetic sample action in the converter.

### Consolidation and crawl signals

- Move the bank-format limitations into an anchored section of the primary guide.
- Permanently redirect the CIMB, Maybank, and Singapore bank-specific URLs to that section; preserve their source files as historical content, but remove those routes from the sitemap and `llms.txt`.
- Keep the existing PDF and scanned-PDF pages because they describe different input workflows.
- Keep all canonical, sitemap, Markdown-header, and host-redirect rules consistent. Remove the unused homepage `SearchAction` markup because the app has no site-search interface.

## Constraints

- Use only the existing synthetic benchmark fixture; never use customer or uploaded statements.
- Never describe the synthetic sample as a real bank statement or as evidence of bank coverage, scanned-PDF/OCR quality, or production accuracy.
- Keep existing file conversion, OCR, editing, privacy, export, and upload analytics behavior intact.
- Do not send sample rows, filenames, or file contents to Vercel Analytics.
- Do not add new dependencies.

## Acceptance criteria

- The sample PDF can be regenerated offline from the existing fixture and is labeled synthetic.
- The app sample action runs that PDF through the actual browser converter and presents the parsed output.
- Sample analytics are separately named and include no properties; a superseded sample has a cancellation event, and ordinary upload, conversion, and export events remain unchanged.
- The primary guide accurately explains sample math, review steps, privacy, outputs, and benchmark limits.
- Bank-specific unvalidated routes redirect to the guide's limitations section and are absent from the sitemap and `llms.txt`.
- The deployed canonical metadata no longer advertises a non-existent site search.
- Build, lint, SEO checks, and the existing synthetic converter benchmark pass.

## Verification

Run the sample-generation command and inspect its PDF signature and visible synthetic label. Run the synthetic statement benchmark, SEO artifact checks, agent checks, production build, and lint. In the browser, use “Try the synthetic sample” and verify that the result, balance status, and sample-only analytics path are shown. Verify the three redirects and primary guide on the production deployment after deployment.
