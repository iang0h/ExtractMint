# ExtractMint Privacy

ExtractMint processes documents in your browser by default. The optional Ask ExtractMint assistant and site analytics have separate data flows described below.

## File conversion

- Core PDF, image, and document conversion runs in your browser; the original file is not sent to a conversion server.
- No account or sign-in is required.
- Optional browser caches can speed repeat work. You can clear them in the app.

## Ask ExtractMint

When you submit a question with a converted document active, the browser sends the question and a compact context to ExtractMint's `/api/agent/` endpoint. That context includes the file name, document type, currency, statement period, row count, confidence and validation details, plus up to five extracted rows with dates, descriptions, amounts, deposits, withdrawals, and balances. The original PDF is not included.

If an AI provider is configured for the agent, the question and context are forwarded to that provider to generate a reply. If no provider is configured, the endpoint uses built-in guidance. Avoid asking about a document if you do not want these selected details sent to the endpoint and, when configured, the AI provider. Review the provider's own privacy terms for its handling and retention.

## Website analytics

ExtractMint uses Vercel Web Analytics for page views and three fixed product events: `upload_started`, `conversion_completed`, and `export_started`. These events include no custom properties, so no filenames or statement contents are sent with them. Vercel describes Web Analytics as cookie-free and based on anonymized data.

## What may be stored locally on my device?

ExtractMint may store **local-only** data to improve performance:

- **OCR cache (optional):** When a PDF has little embedded text, ExtractMint can OCR pages. You can enable a persistent cache so repeat exports are faster.
- **PDF review text index (optional):** ExtractMint can cache per-page text indices used for review matching.
- **Basic UI settings:** Small preferences (for example, toggles) may be stored in browser storage.

## How do I clear everything?

Use the in-app **Trust & privacy** panel and click **Clear all local caches**. This clears:

- persistent OCR cache
- persistent PDF review text index cache
- in-memory review caches for the current session

## Accountant workflow checklist

- Use a private browser profile for client work.
- After exporting, run the in-app **sanity checks** and verify opening/closing balances.
- Clear caches when finishing a client batch if required by your policy.

## Contact

Home: https://extractmint.iangoh.com/

