import type { ConversionResult } from './converter'

export function scanWarningKey(result: Pick<ConversionResult, 'fileName' | 'fileMeta' | 'processedAt'>) {
  return result.fileMeta.sha256 || `${result.fileName}:${result.processedAt}`
}

export function hasUnacknowledgedScanWarning(
  results: Array<Pick<ConversionResult, 'fileName' | 'fileMeta' | 'processedAt' | 'scanQualityWarning'>>,
  acknowledgedKeys: ReadonlySet<string>,
) {
  return results.some(
    (result) => Boolean(result.scanQualityWarning) && !acknowledgedKeys.has(scanWarningKey(result)),
  )
}
