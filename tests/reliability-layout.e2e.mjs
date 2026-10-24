import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const screenshotRoot = resolve(projectRoot, 'artifacts/reliability-review-2026-10-24')
mkdirSync(screenshotRoot, { recursive: true })

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
  assert.ok(address && typeof address === 'object', 'Vite provides a local browser-test address')
  const installedChrome = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  browser = await chromium.launch({
    headless: true,
    ...(existsSync(installedChrome) ? { executablePath: installedChrome } : {}),
  })

  for (const width of [320, 390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, acceptDownloads: true })
    const consoleErrors = []
    page.on('pageerror', (error) => consoleErrors.push(error.message))
    await page.goto(`http://127.0.0.1:${address.port}/#converter`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Load synthetic example' }).click()
    const datePanel = page.locator('.date-convention-panel')
    await datePanel.waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('.table-wrap tbody tr').first().waitFor({ state: 'visible' })

    const dateSelect = datePanel.locator('select')
    assert.equal(await dateSelect.inputValue(), '', `${width}px: ambiguous sample dates wait for a selection`)
    assert.equal(await page.getByRole('button', { name: 'QuickBooks (QBO)' }).isDisabled(), true,
      `${width}px: QBO stays blocked until a date convention is chosen`)

    if (width === 390) {
      await page.locator('.results-section').scrollIntoViewIfNeeded()
      await page.screenshot({ path: resolve(screenshotRoot, 'mobile-390-date-gate.png') })
    }

    await dateSelect.focus()
    await page.keyboard.press('Space')
    await page.keyboard.press('Escape')
    await dateSelect.press('D')
    await dateSelect.press('Enter')
    assert.equal(await dateSelect.inputValue(), 'DD/MM/YYYY', `${width}px: the date format can be selected from the keyboard`)
    await assertWorkspaceFits(page, width, 'after focusing and choosing a date')
    assert.ok((await datePanel.boundingBox())?.x >= 0, `${width}px: date controls remain inside the left viewport edge`)
    const qboButton = page.getByRole('button', { name: 'QuickBooks (QBO)' })
    assert.equal(await qboButton.isDisabled(), false, `${width}px: QBO becomes available after choosing an unambiguous date convention`)
    const qboDownloadPromise = page.waitForEvent('download', { timeout: 5_000 }).catch(() => null)
    await qboButton.click()
    const qboDownload = await qboDownloadPromise
    assert.ok(qboDownload, `${width}px: QBO remains accessible after resolving the date gate`)
    const qboText = readFileSync(await qboDownload.path(), 'utf8')
    assert.ok(qboText.includes('<DTPOSTED>20260403'), `${width}px: QBO writes the selected DD/MM interpretation`)

    if (width === 1280) {
      await page.locator('.results-section').scrollIntoViewIfNeeded()
      await page.evaluate(() => window.scrollBy(0, -24))
      await page.screenshot({ path: resolve(screenshotRoot, 'desktop-1280-results.png') })
    }

    const editToggle = page.getByLabel('Edit values')
    await editToggle.check()
    const transactionIndex = await page.locator('.table-wrap tbody tr').evaluateAll((rows) => rows.findIndex((row) => {
      const values = Array.from(row.querySelectorAll('input')).map((input) => input.value)
      return values.length >= 5 && (values[2] !== '' || values[3] !== '')
    }))
    assert.notEqual(transactionIndex, -1, `${width}px: sample transaction is editable`)
    const transactionRow = page.locator('.table-wrap tbody tr').nth(transactionIndex)
    const balanceInput = transactionRow.locator('input').nth(4)
    const originalBalance = Number(await balanceInput.inputValue())
    await balanceInput.focus()
    await assertWorkspaceFits(page, width, 'after focusing the far-right balance input')
    const horizontalState = await page.evaluate(() => ({
      mainScroll: document.querySelector('main').scrollLeft,
      mainWidth: document.querySelector('main').scrollWidth,
      mainClientWidth: document.querySelector('main').clientWidth,
      tableScroll: document.querySelector('.table-wrap').scrollLeft,
      tableWidth: document.querySelector('.table-wrap').scrollWidth,
      tableClientWidth: document.querySelector('.table-wrap').clientWidth,
    }))
    if (width < 1280) {
      assert.ok(horizontalState.tableScroll > 0, `${width}px: the wide table scrolls within its own wrapper`)
      assert.ok(horizontalState.tableWidth > horizontalState.tableClientWidth, `${width}px: the table keeps its full set of columns`)
    }
    assert.equal(horizontalState.mainScroll, 0, `${width}px: table navigation does not horizontally scroll the whole workspace`)
    assert.equal(horizontalState.mainWidth, horizontalState.mainClientWidth, `${width}px: the page has no horizontal content overflow`)

    await balanceInput.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
    await page.keyboard.type((originalBalance + 0.25).toFixed(2))
    await balanceInput.press('Tab')
    assert.equal(Number(await balanceInput.inputValue()), Number((originalBalance + 0.25).toFixed(2)),
      `${width}px: a keyboard edit is committed when focus leaves the cell`)

    const downloadPromise = page.waitForEvent('download', { timeout: 5_000 }).catch(() => null)
    await page.getByRole('button', { name: 'CSV', exact: true }).click()
    const download = await downloadPromise
    assert.ok(download, `${width}px: CSV remains reachable after review and keyboard editing`)
    const downloaded = readFileSync(await download.path(), 'utf8')
    const csvRows = parseCsv(downloaded)
    const csvHeaders = csvRows[0]
    const description = await transactionRow.locator('input').nth(1).inputValue()
    const exportedRow = csvRows.find((row) => row[csvHeaders.indexOf('Description')] === description)
    assert.ok(exportedRow, `${width}px: CSV includes the edited transaction row`)
    assert.equal(Number(exportedRow[csvHeaders.indexOf('Balance')]), Number((originalBalance + 0.25).toFixed(2)),
      `${width}px: CSV carries the keyboard-edited balance`)
    assert.ok(exportedRow[csvHeaders.indexOf('Source Lines')], `${width}px: editing preserves source-line provenance in CSV`)
    await assertWorkspaceFits(page, width, 'after editing and exporting')

    if (width === 390) {
      await page.locator('.table-wrap').scrollIntoViewIfNeeded()
      await balanceInput.focus()
      await page.screenshot({ path: resolve(screenshotRoot, 'mobile-390-edited-far-right-columns.png') })
    }
    assert.deepEqual(consoleErrors, [], `${width}px: browser reports no uncaught errors`)
    await page.close()
  }

  console.log('Responsive reliability browser checks passed at 320px, 390px, and 1280px: keyboard date choice, isolated table scrolling, editable balance, and CSV download.')
} finally {
  await browser?.close()
  await server.close()
}

async function assertWorkspaceFits(page, width, state) {
  const geometry = await page.evaluate(() => {
    const main = document.querySelector('main')
    const datePanel = document.querySelector('.date-convention-panel')
    const alert = document.querySelector('.date-convention-panel[role="alert"]')
    return {
      mainSize: { scroll: main.scrollWidth, client: main.clientWidth, left: main.scrollLeft },
      datePanelLeft: datePanel.getBoundingClientRect().left,
      alertLeft: alert?.getBoundingClientRect().left,
      pageScroll: document.scrollingElement?.scrollLeft ?? 0,
    }
  })
  const mainSize = geometry.mainSize
  assert.ok(mainSize.scroll <= mainSize.client + 1, `${width}px ${state}: main content fits its viewport (${mainSize.scroll}/${mainSize.client})`)
  assert.equal(mainSize.left, 0, `${width}px ${state}: main does not scroll horizontally`)
  assert.equal(geometry.pageScroll, 0, `${width}px ${state}: document does not scroll horizontally`)
  assert.ok(geometry.datePanelLeft >= 0, `${width}px ${state}: date panel remains visible from the left edge`)
  if (geometry.alertLeft !== undefined) assert.ok(geometry.alertLeft >= 0, `${width}px ${state}: date warning is not clipped`)
}

function parseCsv(text) {
  const lines = text.trimEnd().split(/\r?\n/)
  return lines.map((line) => {
    const cells = []
    let value = ''
    let quoted = false
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index]
      if (character === '"' && line[index + 1] === '"' && quoted) {
        value += '"'
        index += 1
      } else if (character === '"') quoted = !quoted
      else if (character === ',' && !quoted) { cells.push(value); value = '' }
      else value += character
    }
    cells.push(value)
    return cells
  })
}
