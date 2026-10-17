import { track } from '@vercel/analytics'

export type ExtractMintAnalyticsEvent =
  | 'upload_started'
  | 'conversion_completed'
  | 'export_started'

export function trackExtractMintEvent(event: ExtractMintAnalyticsEvent) {
  if (import.meta.env.PROD) track(event)
}
