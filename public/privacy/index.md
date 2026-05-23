# ExtractMint Privacy

ExtractMint is designed to be **private by default** in the current static build.

## What happens to my file?

- **No upload by default:** Conversions run in your browser.
- **No account required:** There is no sign-in and no server-side storage in this static prototype.
- **You control persistence:** Optional browser caches can speed repeat work, and can be cleared at any time.

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

Home: https://extractmint.vercel.app/

