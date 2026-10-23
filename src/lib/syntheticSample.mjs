export const SYNTHETIC_SAMPLE_URL = '/samples/synthetic-bank-statement.pdf'
export const SYNTHETIC_SAMPLE_FILENAME = 'synthetic-bank-statement.pdf'

export function shouldConfirmSampleReplacement(results) {
  return results.some(
    (result) => result.workspaceOrigin !== 'sample-preview' && result.workspaceOrigin !== 'synthetic-sample',
  )
}

export async function fetchSyntheticSample(fetcher = fetch) {
  const response = await fetcher(SYNTHETIC_SAMPLE_URL)
  if (!response.ok) {
    throw new Error(`Could not load the synthetic sample PDF (HTTP ${response.status}).`)
  }
  return response.blob()
}

export function createSampleRunGuard(trackEvent) {
  let activeSample = null

  return {
    startSample() {
      const run = { superseded: false, settled: false }
      activeSample = run
      trackEvent('sample_conversion_started')
      return run
    },
    startUpload() {
      if (activeSample && !activeSample.settled) {
        activeSample.superseded = true
        activeSample.settled = true
        trackEvent('sample_conversion_cancelled')
      }
      activeSample = null
    },
    isCurrent(run) {
      return activeSample === run && !run.superseded
    },
    finish(run, event) {
      if (activeSample !== run || run.settled) return false
      run.settled = true
      activeSample = null
      trackEvent(event)
      return true
    },
  }
}
