import type { ConversionResult } from './converter'

// Keep this shared by the UI and exports so a matching opening/closing total
// cannot hide inconsistent intermediate balances.
export function getStatementIntegrityWarning(result: Pick<ConversionResult, 'validation' | 'provenance'>) {
  const messages: string[] = []
  if (result.validation.issues.some((issue) => issue.code === 'balance-step-inconsistency' || issue.delta !== undefined)) {
    messages.push('Balance-step inconsistency: consecutive balances are not explained by the parsed transaction. This is not proof of a missing row; an amount or balance may be misread. Review the source. A balance chain cannot detect omitted transactions with a net-zero effect.')
  }
  const unattached = result.provenance?.unattachedLineNumbers ?? []
  if (unattached.length > 0) {
    messages.push(`Unattached source lines: ${unattached.join(', ')}. Consumed statement text was not attached to an exported row; review the source for completeness.`)
  }
  const ambiguous = result.provenance?.ambiguousLineNumbers ?? []
  if (ambiguous.length > 0) {
    messages.push(`Ambiguous transaction starts on source lines: ${ambiguous.join(', ')}. These lines remain description/review evidence rather than money rows; verify them against the source before exporting.`)
  }
  return messages.length > 0 ? messages.join(' ') : undefined
}
