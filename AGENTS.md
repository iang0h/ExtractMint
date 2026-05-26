# ExtractMint Agent Guide

This project is the ExtractMint web app for bank-statement, receipt, invoice, scan, and office-document conversion.

## Skill Routing

- Use Superpowers for non-trivial implementation work: test-first changes, systematic debugging, independent subagent tracks, and verification-before-completion.
- Use gstack when a browser check matters: live route smoke tests, responsive layout, upload flow, console/network errors, screenshots, or post-deploy canaries.
- Use Vercel skills and the shared deployment policy for deployment decisions. Worker agents do not run routine production deploys directly.

## Repo Checks

Start every worker run with:

- `git status --short --branch`
- `git log -5 --oneline --decorate`
- `npm run lint`
- `npm run build`

Run targeted tests when the touched area matches:

- `npm run test:seo` for `public/`, metadata, Markdown mirrors, sitemap, `llms.txt`, or schema changes.
- `npm run test:agent` for conversion, extraction, export, local AI guidance, or API/discovery changes.
- `npm run test:automation` for automation prompt, worker cadence, deploy policy, or process changes.

## Deployment Policy

Routine production deploys go through `/Users/iangoh/.codex/automations/vercel-deploy-queue.md`.

Worker agents should prepare, verify, commit, and queue deploy-ready work. The shared Vercel 4-hour deploy batcher handles production Vercel deploys and aliases unless Ian explicitly requests an urgent exception.

Queue entries should include project, public URL, repo path, branch/commit, verification results, changed routes/assets, smoke checks, risks, blockers, rollback notes, and gstack evidence when browser QA was relevant.

## Product Priorities

Prioritize one high-impact improvement per run:

- extraction accuracy and balance validation
- accountant review workflows and export quality
- onboarding, pricing, trust, privacy, and conversion
- SEO, `llms.txt`, sitemap, OpenAPI, and Markdown mirror discoverability
- performance, reliability, and deployment freshness

Preserve the privacy boundary. Do not upload private statements, receipts, bank data, passports, or sensitive user documents to third-party services unless the user explicitly approves that exact action.
