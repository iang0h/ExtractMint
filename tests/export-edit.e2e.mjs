import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const server = await createServer({
  configFile: resolve(projectRoot, 'vite.config.ts'),
  root: projectRoot,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, strictPort: false },
})

let browser
try {
  await server.listen()
  const address = server.httpServer.address()
  assert.ok(address && typeof address === 'object', 'Vite provides an HTTP address')
  const url = `http://127.0.0.1:${address.port}/#converter`
  const installedChrome = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  browser = await chromium.launch({
    headless: true,
    ...(existsSync(installedChrome) ? { executablePath: installedChrome } : {}),
  })
  const page = await browser.newPage({ acceptDownloads: true })
  const consoleErrors = []
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  await page.goto(url, { waitUntil: 'networkidle' })

  const statement = [
    'Cloudberry Test Bank — synthetic statement, all values invented, USD',
    'Statement period: 2026-04-01 to 2026-04-02',
    'Date\tDescription\tReference\tWithdrawal\tDeposit\tTax\tBalance',
    '\tOPENING BALANCE\t\t\t\t\t1,000.00',
    '2026-04-01\tSynthetic flagged withdrawal\tFICTION-01\t100.00\t\t\t900.00',
    '2026-04-02\tSynthetic deposit\tFICTION-02\t\t50.00\t\t950.00',
    '\tCLOSING BALANCE\t\t\t\t\t950.00',
  ].join('\n')
  const upload = page.locator('input[type="file"]').first()
  await upload.setInputFiles({
    name: 'synthetic-edit-check.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(statement),
  })

  const editToggle = page.getByLabel('Edit values')
  await editToggle.waitFor({ state: 'visible', timeout: 15_000 })
  await editToggle.check()

  const targetIndex = await page.locator('tbody tr').evaluateAll((rows) => rows.findIndex((row) =>
    Array.from(row.querySelectorAll('input')).some((input) => input.value === 'Synthetic flagged withdrawal'),
  ))
  assert.notEqual(targetIndex, -1, 'uploaded synthetic statement renders the withdrawal row')
  const targetRow = page.locator('tbody tr').nth(targetIndex)
  const withdrawalInput = targetRow.locator('input').nth(2)
  const targetDepositInput = targetRow.locator('input').nth(3)
  const targetBalanceInput = targetRow.locator('input').nth(4)
  await withdrawalInput.focus()
  await withdrawalInput.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  await page.keyboard.type('110.00', { delay: 25 })
  await withdrawalInput.press('Tab')

  await targetRow.getByText('Review', { exact: true }).waitFor({ state: 'visible' })
  assert.equal(await targetRow.locator('td').nth(6).innerText(), 'Withdrawal', 'edited row displays Withdrawal category')

  const downloadPromise = page.waitForEvent('download', { timeout: 5_000 }).catch(() => null)
  await page.getByRole('button', { name: 'CSV', exact: true }).click()
  const download = await downloadPromise
  assert.ok(download, `expected a CSV download; visible alerts: ${(await page.getByRole('alert').allInnerTexts()).join(' | ')}`)
  const downloadPath = await download.path()
  assert.ok(downloadPath, 'browser saved the CSV download')
  const csvText = readFileSync(downloadPath, 'utf8')
  const csvRows = parseCsv(csvText)
  const csvHeaders = csvRows[0]
  const downloadedRow = csvRows.find((row) => row[csvHeaders.indexOf('Description')] === 'Synthetic flagged withdrawal')
  assert.ok(downloadedRow, 'downloaded CSV retains the edited transaction')
  assert.equal(Number(downloadedRow[csvHeaders.indexOf('Withdrawal')]), 110)
  assert.equal(Number(downloadedRow[csvHeaders.indexOf('Amount')]), -110)
  assert.equal(downloadedRow[csvHeaders.indexOf('Category')], 'Withdrawal')
  assert.equal(downloadedRow[csvHeaders.indexOf('Review Status')], 'Review')

  const depositIndex = await page.locator('tbody tr').evaluateAll((rows) => rows.findIndex((row) =>
    Array.from(row.querySelectorAll('input')).some((input) => input.value === 'Synthetic deposit'),
  ))
  assert.notEqual(depositIndex, -1, 'uploaded synthetic statement renders the deposit row')
  const depositRow = page.locator('tbody tr').nth(depositIndex)
  const depositWithdrawalInput = depositRow.locator('input').nth(2)
  const depositInput = depositRow.locator('input').nth(3)
  await depositWithdrawalInput.focus()
  await depositWithdrawalInput.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  await page.keyboard.type('25.00', { delay: 25 })
  await depositWithdrawalInput.press('Tab')
  assert.equal(
    await depositInput.evaluate((element) => element === document.activeElement),
    true,
    'real Tab navigation moves from the edited withdrawal into the deposit cell',
  )
  await depositInput.press('Tab')
  await depositRow.locator('td').nth(6).getByText('Withdrawal', { exact: true }).waitFor({ state: 'visible' })
  assert.equal(await depositInput.inputValue(), '', 'the cleared opposite-direction cell stays empty after tabbing through it')

  const flippedDownloadPromise = page.waitForEvent('download', { timeout: 5_000 }).catch(() => null)
  await page.getByRole('button', { name: 'CSV', exact: true }).click()
  const flippedDownload = await flippedDownloadPromise
  assert.ok(flippedDownload, `expected a CSV download after direction edit; visible alerts: ${(await page.getByRole('alert').allInnerTexts()).join(' | ')}`)
  const flippedPath = await flippedDownload.path()
  assert.ok(flippedPath, 'browser saved the CSV after direction edit')
  const flippedCsvRows = parseCsv(readFileSync(flippedPath, 'utf8'))
  const flippedHeaders = flippedCsvRows[0]
  const flippedRow = flippedCsvRows.find((row) => row[flippedHeaders.indexOf('Description')] === 'Synthetic deposit')
  assert.ok(flippedRow, 'downloaded CSV retains the direction-edited row')
  assert.equal(Number(flippedRow[flippedHeaders.indexOf('Withdrawal')]), 25)
  assert.equal(flippedRow[flippedHeaders.indexOf('Deposit')], '')
  assert.equal(Number(flippedRow[flippedHeaders.indexOf('Amount')]), -25)
  assert.equal(flippedRow[flippedHeaders.indexOf('Category')], 'Withdrawal')

  await withdrawalInput.focus()
  await withdrawalInput.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  await page.keyboard.type('abc', { delay: 25 })
  await withdrawalInput.press('Tab')
  assert.equal(await withdrawalInput.inputValue(), 'abc', 'malformed money text remains visible after blur')
  const malformedExportAlert = page.getByRole('alert').filter({ hasText: 'invalid withdrawal edit' })
  assert.equal(await targetDepositInput.evaluate((element) => element === document.activeElement), true, 'tabbing moves into the empty direction field')
  await targetDepositInput.press('Tab')
  assert.equal(await targetBalanceInput.evaluate((element) => element === document.activeElement), true, 'tabbing through the empty field preserves normal keyboard navigation')
  await targetBalanceInput.focus()
  await targetBalanceInput.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  await page.keyboard.type('xyz', { delay: 25 })
  await targetBalanceInput.press('Tab')
  assert.equal(await withdrawalInput.inputValue(), 'abc', 'invalid withdrawal text remains visible after editing another field')
  assert.equal(await targetBalanceInput.inputValue(), 'xyz', 'invalid balance text remains visible alongside the withdrawal error')
  assert.equal(await withdrawalInput.getAttribute('aria-invalid'), 'true', 'invalid withdrawal is visibly marked')
  assert.equal(await targetBalanceInput.getAttribute('aria-invalid'), 'true', 'invalid balance is visibly marked')
  await page.getByRole('button', { name: 'CSV', exact: true }).click()
  await malformedExportAlert.waitFor({ state: 'visible' })

  await targetBalanceInput.focus()
  await targetBalanceInput.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  await page.keyboard.type('900.00', { delay: 25 })
  await targetBalanceInput.press('Tab')
  assert.equal(Number(await targetBalanceInput.inputValue()), 900, 'correcting balance clears only its invalid edit')
  assert.equal(await withdrawalInput.inputValue(), 'abc', 'correcting balance leaves withdrawal invalid')
  assert.equal(await targetBalanceInput.getAttribute('aria-invalid'), 'false', 'corrected balance clears its visible invalid state')
  assert.equal(await withdrawalInput.getAttribute('aria-invalid'), 'true', 'the remaining invalid withdrawal stays visibly marked')
  await page.getByRole('button', { name: 'CSV', exact: true }).click()
  await malformedExportAlert.waitFor({ state: 'visible' })

  await withdrawalInput.focus()
  await withdrawalInput.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  await page.keyboard.type('110.00', { delay: 25 })
  await withdrawalInput.press('Tab')
  const recoveredDownloadPromise = page.waitForEvent('download', { timeout: 5_000 }).catch(() => null)
  await page.getByRole('button', { name: 'CSV', exact: true }).click()
  const recoveredDownload = await recoveredDownloadPromise
  assert.ok(recoveredDownload, `expected CSV export after correcting both fields; visible alerts: ${(await page.getByRole('alert').allInnerTexts()).join(' | ')}`)
  assert.equal(await withdrawalInput.getAttribute('aria-invalid'), 'false', 'correcting the final field clears its invalid state')

  await withdrawalInput.focus()
  await withdrawalInput.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  await page.keyboard.press('Backspace')
  await withdrawalInput.press('Tab')
  await targetRow.locator('td').nth(6).getByText('Transaction', { exact: true }).waitFor({ state: 'visible' })
  await page.getByRole('button', { name: 'CSV', exact: true }).click()
  const exportAlert = page.getByRole('alert').filter({ hasText: 'Export paused' })
  await exportAlert.waitFor({ state: 'visible' })
  assert.match(await exportAlert.innerText(), /export paused|resolved amount/i, 'invalid edited row shows a visible export block')
  assert.deepEqual(consoleErrors, [], 'browser has no uncaught page errors')
  console.log('Real-browser edit/export check passed: keyboard direction change, multiple retained invalid fields, per-field correction, and export blocking/recovery.')
} finally {
  await browser?.close()
  await server.close()
}

function parseCsv(text) {
  return text.trimEnd().split(/\r?\n/).map((line) => {
    const cells = []
    let value = ''
    let quoted = false
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index]
      if (character === '"' && line[index + 1] === '"' && quoted) {
        value += '"'
        index += 1
      } else if (character === '"') {
        quoted = !quoted
      } else if (character === ',' && !quoted) {
        cells.push(value)
        value = ''
      } else {
        value += character
      }
    }
    cells.push(value)
    return cells
  })
}
