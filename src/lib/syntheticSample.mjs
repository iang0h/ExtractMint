export const SYNTHETIC_SAMPLE_URL = '/samples/synthetic-bank-statement.pdf'
export const SYNTHETIC_SAMPLE_FILENAME = 'synthetic-bank-statement.pdf'

export async function fetchSyntheticSample(fetcher = fetch) {
  const response = await fetcher(SYNTHETIC_SAMPLE_URL)
  if (!response.ok) {
    throw new Error(`Could not load the synthetic sample PDF (HTTP ${response.status}).`)
  }
  return response.blob()
}
