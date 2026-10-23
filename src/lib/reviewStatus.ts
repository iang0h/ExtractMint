export type RowReviewIssue = {
  severity: 'info' | 'warning' | 'error'
  message: string
  rowIndex?: number
}

export type RowReviewValidation = {
  issues: RowReviewIssue[]
  validatedRowIndexes?: number[]
}

export type RowReviewState = {
  status: 'Review' | 'Check' | 'Verified' | 'Unvalidated'
  note: string
}

export function getRowReview(validation: RowReviewValidation | undefined, rowIndex: number): RowReviewState {
  if (!validation) return { status: 'Unvalidated', note: '' }
  const issues = validation.issues.filter((issue) => issue.rowIndex === rowIndex)
  const uniqueMessages = [...new Set(issues.map((issue) => issue.message))]
  const note = uniqueMessages.join(' ')
  if (issues.some((issue) => issue.severity === 'error')) return { status: 'Review', note }
  if (issues.length > 0) return { status: 'Check', note }
  if (validation.validatedRowIndexes?.includes(rowIndex)) return { status: 'Verified', note: '' }
  return { status: 'Unvalidated', note: '' }
}

export function lowerRowConfidence<TRow extends { confidence: number }>(
  rows: TRow[],
  validation: RowReviewValidation,
): TRow[] {
  return rows.map((row, rowIndex) => {
    const issues = validation.issues.filter((issue) => issue.rowIndex === rowIndex)
    const confidenceCap = issues.some((issue) => issue.severity === 'error')
      ? 54
      : issues.length > 0
        ? 68
        : undefined
    return confidenceCap === undefined || row.confidence <= confidenceCap
      ? row
      : { ...row, confidence: confidenceCap }
  })
}
