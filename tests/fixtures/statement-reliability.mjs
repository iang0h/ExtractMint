import { jsPDF } from 'jspdf'
import { createCanvas } from '@napi-rs/canvas'

const magnitudes = [41, 999.95, 10000, 25000, 100000]

export function createColumnStatement({ offset = 0, includeHeaders = true, multiPage = false } = {}) {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'legal' })
  let pageOffset = offset
  const columns = () => ({
    date: 40 + pageOffset,
    description: 170 + pageOffset,
    reference: 390 + pageOffset,
    withdrawal: 585 + pageOffset,
    deposit: 720 + pageOffset,
    balance: 875 + pageOffset,
  })
  const y = { intro: 35, header: 112, firstRow: 138, step: 23 }
  const money = (amount) => amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const drawPageHeader = (pageNumber) => {
    const x = columns()
    pdf.setFont('helvetica', 'bold')
    pdf.text('Testbank Synthetic Statement', 40 + pageOffset, y.intro)
    pdf.setFont('helvetica', 'normal')
    pdf.text('Account: 0000000427 | Account holder: Avery Example', 40 + pageOffset, y.intro + 16)
    pdf.text('Statement period: 03/04/2026 to 13/04/2026 | All values invented for testing', 40 + pageOffset, y.intro + 32)
    if (multiPage) pdf.text(`Page ${pageNumber} of 2`, 940, y.intro + 32)
    if (includeHeaders) {
      pdf.setFont('helvetica', 'bold')
      pdf.text('Date', x.date, y.header)
      pdf.text('Description', x.description, y.header)
      pdf.text('Reference', x.reference, y.header)
      pdf.text('Withdrawal', x.withdrawal - 8, y.header)
      pdf.text('Deposit', x.deposit - 8, y.header)
      pdf.text('Balance', x.balance - 8, y.header)
    }
    pdf.setFont('helvetica', 'normal')
  }
  drawPageHeader(1)

  const opening = 250000
  const firstRow = includeHeaders ? y.firstRow : y.header
  const x = columns()
  pdf.text('OPENING BALANCE', x.description, firstRow)
  pdf.text(money(opening), x.balance, firstRow, { align: 'right' })

  let balance = opening
  const entries = magnitudes.flatMap((amount, index) => [
    { amount, direction: 'debit', index: index * 2 },
    { amount, direction: 'credit', index: index * 2 + 1 },
  ])
  entries.forEach(({ amount, direction, index }) => {
    if (multiPage && index === 5) {
      pdf.addPage()
      pageOffset = offset + 70
      drawPageHeader(2)
    }
    const rowOnPage = multiPage && index >= 5 ? index - 5 : index
    const rowY = firstRow + (rowOnPage + 1) * y.step
    const rowColumns = columns()
    const withdrawal = direction === 'debit'
    balance = Number((balance + (withdrawal ? -amount : amount)).toFixed(2))
    const label = withdrawal ? `Synthetic debit ${index + 1}` : `Synthetic credit ${index + 1}`
    pdf.text(`${String(4 + index).padStart(2, '0')}/04/2026`, rowColumns.date, rowY)
    pdf.text(label, rowColumns.description, rowY)
    pdf.text(`SYN-${String(index + 1).padStart(3, '0')}`, rowColumns.reference, rowY)
    if (withdrawal) pdf.text(money(amount), rowColumns.withdrawal, rowY, { align: 'right' })
    else pdf.text(money(amount), rowColumns.deposit, rowY, { align: 'right' })
    pdf.text(money(balance), rowColumns.balance, rowY, { align: 'right' })
  })

  return new Uint8Array(pdf.output('arraybuffer'))
}

export const reliabilityMagnitudes = magnitudes

export function createImageOnlyStatementPdf() {
  const canvas = createCanvas(1400, 1800)
  const context = canvas.getContext('2d')
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#111'
  context.font = 'bold 44px Arial'
  const lines = [
    'Testbank Synthetic Statement',
    'Account: 0000000427 | Account holder: Avery Example',
    'Statement period: 03/04/2026 to 05/04/2026',
    'OPENING BALANCE 1,000.00',
    '03/04/2026 Synthetic debit (40.00) 960.00',
    '04/04/2026 Important notice: statement information changes on 05/04/2026',
    '04/04/2026 Synthetic row unreadable',
    '05/04/2026 Synthetic credit +50.00 1,010.00',
    'CLOSING BALANCE 1,010.00',
    'Page 1 of 1',
  ]
  lines.forEach((line, index) => context.fillText(line, 100, 120 + index * 160))

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 612, 792)
  return new Uint8Array(pdf.output('arraybuffer'))
}
