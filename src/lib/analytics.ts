import { track } from '@vercel/analytics'

export type ExtractMintAnalyticsEvent =
  | 'upload_started'
  | 'conversion_completed'
  | 'export_started'
  | 'sample_conversion_started'
  | 'sample_conversion_cancelled'
  | 'sample_conversion_completed'
  | 'sample_conversion_failed'

export function trackExtractMintEvent(event: ExtractMintAnalyticsEvent) {
  if (import.meta.env.MODE === 'desktop') return
  if (import.meta.env.PROD) track(event)
}
