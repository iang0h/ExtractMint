export function scanQualityWarningFor(amountsUnreadable: boolean, balancesUnreadable: boolean) {
  const warnings = [
    amountsUnreadable
      ? 'Amounts could not be read from some scanned lines. Try a clearer scan or a text-based PDF, then review the source before exporting.'
      : undefined,
    balancesUnreadable
      ? 'Some running-balance values could not be read from scanned lines. Try a clearer scan or a text-based PDF, then review the source before exporting.'
      : undefined,
  ].filter(Boolean)

  return warnings.length > 0 ? warnings.join(' ') : undefined
}
