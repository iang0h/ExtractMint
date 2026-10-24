import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { jsPDF } from 'jspdf'

const root = resolve(dirname(fileURLToPath(import.meta.url)), 'reliability-review')
await mkdir(root, { recursive: true })

const pdf = new jsPDF({ unit: 'pt', format: 'letter', compress: true })
const columns = [28, 92, 260, 362, 435, 500, 548]
const headers = ['Date', 'Description', 'Reference', 'Debit', 'Credit', 'Tax', 'Balance']
const openingBalance = 10000
let pageNumber = 0

function dateForId(id) {
  const month = 4 + Math.floor((id - 1) / 16)
  const day = 13 + ((id - 1) % 16)
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/2026`
}

function balanceAfter(id) {
  const completePairs = Math.floor(id / 2)
  const priorBalance = openingBalance + completePairs * 12.65
  return id % 2 === 1 ? priorBalance - 12.35 : priorBalance
}

function beginPage() {
  if (pageNumber > 0) pdf.addPage()
  pageNumber += 1
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.text('SYNTHETIC DD/MM BANK - Account Statement', 28, 30)
  pdf.text(`Account DEMO-DDMM Statement period 13/04/2026 - 16/12/2026 Page ${pageNumber} of 7`, 28, 45)
  headers.forEach((header, index) => pdf.text(header, columns[index], 65))
}

function drawMoney(id, y) {
  const withdrawal = id % 2 === 1 ? 12.35 : undefined
  const deposit = id % 2 === 0 ? 25 : undefined
  if (withdrawal !== undefined) pdf.text(withdrawal.toFixed(2), columns[3], y)
  if (deposit !== undefined) pdf.text(deposit.toFixed(2), columns[4], y)
  pdf.text(balanceAfter(id).toFixed(2), columns[6], y)
}

for (let page = 0; page < 7; page += 1) {
  beginPage()
  if (page === 0) {
    pdf.text('OPENING BALANCE', columns[1], 82)
    pdf.text(openingBalance.toFixed(2), columns[6], 82)
  }
  if (page === 1) pdf.text('CONTINUED DESCRIPTION REF-DDMM-020', columns[1], 82)

  const firstId = page * 20 + 1
  const finalId = Math.min(firstId + 19, 132)
  let y = 102
  for (let id = firstId; id <= finalId; id += 1) {
    const reference = `REF-DDMM-${String(id).padStart(3, '0')}`
    const description = id === 1
      ? 'POS PURCHASE GROCERY MART'
      : id === 20
        ? 'DEMO TXN 020 HARDWARE'
        : `DEMO TXN ${String(id).padStart(3, '0')} ${id % 2 ? 'PURCHASE' : 'DEPOSIT'}`
    pdf.text(dateForId(id), columns[0], y)
    pdf.text(description, columns[1], y)
    pdf.text(reference, columns[2], y)
    if (id === 2) {
      y += 13
      drawMoney(id, y)
      y += 19
      continue
    }
    drawMoney(id, y)
    y += 19
  }

  if (page === 6) {
    y += 10
    pdf.text('CLOSING BALANCE', columns[1], y)
    pdf.text(balanceAfter(132).toFixed(2), columns[6], y)
  }
}

await writeFile(resolve(root, 'ddmm-completeness-132.pdf'), Buffer.from(pdf.output('arraybuffer')))
