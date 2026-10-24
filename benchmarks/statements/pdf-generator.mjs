import { jsPDF } from 'jspdf'

function wrappedLines(text, maxLength = 94) {
  const words = text.split(/\s+/)
  const lines = []
  let line = ''

  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (next.length > maxLength && line) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

export function createStatementPdf(statementCase, options = {}) {
  const pdf = new jsPDF({ unit: 'pt', format: 'letter', compress: true })
  const includeDateFormat = options.includeDateFormat ?? Boolean(statementCase.dateFormat)
  const includeHeaders = options.includeHeaders ?? true
  const left = 22
  let y = 38
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)

  // Enough non-whitespace text keeps the real converter on its embedded-text path.
  for (const line of wrappedLines(statementCase.introText)) {
    pdf.text(line, left, y)
    y += 10
  }

  y += 18
  pdf.setFontSize(10)
  pdf.text('SYNTHETIC STATEMENT — LOCAL BENCHMARK', left, y)
  y += includeDateFormat ? 14 : 18
  if (includeDateFormat && statementCase.dateFormat) {
    pdf.setFontSize(8)
    pdf.text(`Date format: ${statementCase.dateFormat}`, left, y)
    y += 14
  }

  const columns = [20, 72, 250, 320, 395, 470, 510]
  pdf.setFontSize(8)
  if (includeHeaders) {
    statementCase.headers.forEach((header, columnIndex) => {
      if (header) pdf.text(String(header), columns[columnIndex], y)
    })
    y += 15
  }
  statementCase.tableRows.forEach((row) => {
    row.cells.forEach((cell, columnIndex) => {
      if (cell) pdf.text(String(cell), columns[columnIndex], y)
    })
    y += 15
  })

  return new Uint8Array(pdf.output('arraybuffer'))
}
