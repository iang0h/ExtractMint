// All names, account identifiers, dates, references, and amounts are invented.
const magnitudes = [0.01, 25000, 0.05, 100000, 5000]
const cellLine = (cells) => cells.join('\t')
const money = (value) => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const header = cellLine(['Date', 'Description', 'Reference', 'Withdrawal', 'Deposit', 'Tax', 'Balance'])

export function createMultilineStatement({ pageBreak = true } = {}) {
  const lines = [
    'Cloudberry Test Bank — synthetic statement, all values invented',
    'Account No: 0000000713 | Holder: Taylor Fiction',
    'Statement period: 01/06/2026 to 10/06/2026 | USD',
    header,
    cellLine(['', 'OPENING BALANCE', '', '', '', '', money(400000)]),
  ]
  const transactionSourceLines = []
  const descriptions = []
  let balance = 400000
  magnitudes.flatMap((value) => [-value, value]).forEach((amount, index) => {
    balance = Math.round((balance + amount) * 100) / 100
    const sourceLines = []
    const append = (line) => { lines.push(line); sourceLines.push(lines.length) }
    const financials = ['', amount < 0 ? money(-amount) : '', amount > 0 ? money(amount) : '', '', money(balance)]
    const title = `Invented transfer ${index + 1}`
    const deferredAmounts = index % 2 === 1
    append(cellLine([`${String(index + 1).padStart(2, '0')}/06/2026`, title, ...(deferredAmounts ? [] : financials)]))
    const parts = [title]
    for (let part = 0; part < 1 + index % 5; part += 1) {
      const text = (index === 2 || index === 7) && part === 0
        ? '12/07/2026 scheduled memo 999.99 only'
        : `Fictional detail ${index + 1}.${part + 1}`
      parts.push(text)
      if (pageBreak && index === 4 && part === 2) {
        lines.push('Page 1 of 2', '\f', header)
      }
      // Some extractors return description-only lines without tab padding.
      append(index === 2 && part === 0 ? text : cellLine(['', text]))
    }
    if (index % 3 === 0) append(cellLine(['', '', `FICTION-REF-${index + 1}`]))
    if (deferredAmounts) append(cellLine(['', '', ...financials]))
    transactionSourceLines.push(sourceLines)
    descriptions.push(parts.join(' '))
  })
  lines.push(cellLine(['', 'CLOSING BALANCE', '', '', '', '', money(balance)]))
  return {
    text: lines.join('\n'),
    transactionCount: 10,
    deposits: 130000.06,
    withdrawals: 130000.06,
    openingBalance: 400000,
    closingBalance: 400000,
    transactionSourceLines,
    descriptions,
  }
}
