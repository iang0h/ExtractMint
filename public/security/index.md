# ExtractMint Security

ExtractMint’s static build is designed for **local-first conversion**: the document is processed in your browser.

This page describes the current security posture and what to do when using ExtractMint in an accountant workflow.

## Current security posture (static build)

- **Browser-side processing:** conversions run locally in the browser.
- **No server-side storage:** there is no account system and no backend database in this prototype.
- **Optional local caches:** OCR results and review indices can be persisted locally to speed repeat exports; you can clear them in-app.

## What this does NOT mean

- This is not a SOC2/ISO product claim.
- Like any browser app, your security also depends on your device hygiene and browser extensions.

## Accountant workflow checklist

- Use a private browser profile with minimal extensions.
- Confirm you are on `extractmint.vercel.app` before processing client documents.
- After export, validate opening/closing balances and review any low-confidence rows.
- Clear all local caches after completing a client batch if required.

## Contact

Home: https://extractmint.vercel.app/

