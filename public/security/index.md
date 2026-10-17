# ExtractMint Security

ExtractMint's core conversion is local-first: the document is processed in your browser. Optional assistant questions and website analytics have the limited data flows described on the [privacy page](https://extractmint.iangoh.com/privacy/).

This page describes the current security posture and what to do when using ExtractMint in an accountant workflow.

## Current security posture (static build)

- **Browser-side processing:** conversions run locally in the browser.
- **No conversion upload:** the original document is not sent to a conversion server.
- **Assistant context is separate:** when you ask the agent, your question, file name, document details, and up to five extracted rows go to the agent endpoint; a configured AI provider may receive them. The original PDF is not included.
- **No account system:** sign-in is not required.
- **Optional local caches:** OCR results and review indices can be persisted locally to speed repeat exports; you can clear them in-app.

## What this does NOT mean

- This is not a SOC2/ISO product claim.
- Like any browser app, your security also depends on your device hygiene and browser extensions.

## Accountant workflow checklist

- Use a private browser profile with minimal extensions.
- Confirm you are on `extractmint.iangoh.com` before processing client documents.
- After export, validate opening/closing balances and review any low-confidence rows.
- Clear all local caches after completing a client batch if required.

## Contact

Home: https://extractmint.iangoh.com/

