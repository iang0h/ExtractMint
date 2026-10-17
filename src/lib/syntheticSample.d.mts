export declare const SYNTHETIC_SAMPLE_URL: string
export declare const SYNTHETIC_SAMPLE_FILENAME: string
export declare function fetchSyntheticSample(fetcher?: typeof fetch): Promise<Blob>
export type SampleRun = { superseded: boolean; settled: boolean }
export declare function createSampleRunGuard(
  trackEvent: (event: 'sample_conversion_started' | 'sample_conversion_cancelled' | 'sample_conversion_completed' | 'sample_conversion_failed') => void,
): {
  startSample(): SampleRun
  startUpload(): void
  isCurrent(run: SampleRun): boolean
  finish(run: SampleRun, event: 'sample_conversion_completed' | 'sample_conversion_failed'): boolean
}
