import type { ExtractedRow } from './converter'

export type AmountReadability = 'readable' | 'unreadable' | 'not-found'

export type RowAmountSummary = {
  amountStatus: AmountReadability
  totalDetected?: number
  deposits?: number
  withdrawals?: number
  transactionNet?: number
}

function signedRowAmount(row: ExtractedRow) {
  if (typeof row.amount === 'number' && Number.isFinite(row.amount)) return row.amount
  if (typeof row.deposit === 'number' && Number.isFinite(row.deposit)) return row.deposit
  if (typeof row.withdrawal === 'number' && Number.isFinite(row.withdrawal)) return -row.withdrawal
  if (typeof row.tax === 'number' && Number.isFinite(row.tax)) return -row.tax
  return undefined
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function receiptTotal(rows: ExtractedRow[]) {
  const totalRow = [...rows].reverse().find((row) =>
    row.category === 'Total' && !/\b(?:sub\s*total|tax)\b/i.test(row.description),
  )
  const value = totalRow ? signedRowAmount(totalRow) : undefined
  return value === undefined ? undefined : Math.abs(value)
}

export function summarizeRowAmounts(
  rows: ExtractedRow[],
  documentKind: string,
  forceUnreadable = false,
): RowAmountSummary {
  if (forceUnreadable) return { amountStatus: 'unreadable' }

  if (documentKind.toLowerCase() === 'receipt') {
    const totalDetected = receiptTotal(rows)
    return totalDetected === undefined
      ? { amountStatus: 'not-found' }
      : { amountStatus: 'readable', totalDetected }
  }

  const transactions = rows.filter((row) =>
    row.category !== 'Balance' && row.category !== 'Total' &&
    (row.date !== undefined || row.edited === true || row.amount !== undefined ||
      row.deposit !== undefined || row.withdrawal !== undefined || row.tax !== undefined),
  )
  if (transactions.length === 0) return { amountStatus: 'not-found' }

  const amounts = transactions.map(signedRowAmount)
  if (amounts.some((amount) => amount === undefined)) return { amountStatus: 'unreadable' }

  const deposits = roundMoney(amounts.reduce<number>((sum, amount) => sum + Math.max(amount ?? 0, 0), 0))
  const withdrawals = roundMoney(amounts.reduce<number>((sum, amount) => sum + Math.max(-(amount ?? 0), 0), 0))
  return {
    amountStatus: 'readable',
    totalDetected: roundMoney(deposits + withdrawals),
    deposits,
    withdrawals,
    transactionNet: roundMoney(deposits - withdrawals),
  }
}

export function receiptDisplayDetails(summary: { vendor?: string; receiptDate?: string }) {
  return {
    merchant: summary.vendor?.trim() || 'Not found in text',
    date: summary.receiptDate?.trim() || 'Not found in text',
  }
}
