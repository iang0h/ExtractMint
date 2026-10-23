const moneyColumns = (date, description, withdrawal, deposit, balance) =>
  `${date}\t${description}\t\t${withdrawal ?? ''}\t${deposit ?? ''}\t\t${balance ?? ''}`

export function createDateConventionStatement({
  format = 'DD/MM/YYYY',
  explicitPeriod = true,
  ambiguous = false,
  closingDate,
} = {}) {
  const dates = ambiguous
    ? ['03/04/2026', '07/04/2026']
    : format === 'MM/DD/YYYY'
      ? ['04/13/2026', '04/14/2026']
      : ['13/04/2026', '14/04/2026']
  const period = ambiguous
    ? ['01/04/2026', '07/04/2026']
    : format === 'MM/DD/YYYY'
      ? ['04/01/2026', '04/30/2026']
      : ['01/04/2026', '30/04/2026']
  const lines = [
    'Synthetic test bank statement USD',
    ...(explicitPeriod ? [`Statement period: ${period[0]} to ${period[1]}`] : []),
    'Date\tDescription\tReference\tWithdrawal\tDeposit\tTax\tBalance',
    'OPENING BALANCE\t\t\t\t\t\t100.00',
    moneyColumns(dates[0], 'Synthetic purchase', '10.00', undefined, '90.00'),
    moneyColumns(dates[1], 'Synthetic deposit', undefined, '10.00', '100.00'),
    ...(closingDate ? [`CLOSING BALANCE AS OF ${closingDate}\t\t\t\t\t\t100.00`] : ['CLOSING BALANCE\t\t\t\t\t\t100.00']),
  ]

  return lines.join('\n')
}
