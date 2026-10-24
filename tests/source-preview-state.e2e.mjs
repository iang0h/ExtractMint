import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const fixtureRoot = resolve(projectRoot, 'tests/fixtures/reliability-review')
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

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.addInitScript(() => localStorage.setItem('extractmint.showSourcePreview', '1'))
  await page.goto(`http://127.0.0.1:${address.port}/#converter`, { waitUntil: 'networkidle' })

  const fixtureFiles = ['test_multiline.pdf', 'test_statement_us.pdf']
    .map((fileName) => resolve(fixtureRoot, fileName))
  await page.locator('input[type="file"]').first().setInputFiles(fixtureFiles)

  const multilineCard = page.getByRole('button', { name: /test_multiline\.pdf/ })
  const usCard = page.getByRole('button', { name: /test_statement_us\.pdf/ })
  await multilineCard.waitFor({ state: 'visible', timeout: 30_000 })
  await usCard.waitFor({ state: 'visible', timeout: 30_000 })

  const source = page.locator('.source-preview')
  const title = source.locator('.source-header strong')
  const pageNumber = source.locator('.page-controls input')
  const pageTotal = source.locator('.page-total')
  await multilineCard.click()
  await title.getByText('test_multiline.pdf', { exact: true }).waitFor({ state: 'visible', timeout: 15_000 })
  await pageTotal.getByText('of 2', { exact: true }).waitFor({ state: 'visible' })

  const firstRow = page.locator('.table-wrap tbody tr').first()
  await firstRow.click()
  await firstRow.waitFor({ state: 'visible' })
  await assertEventually(async () => firstRow.evaluate((row) => row.classList.contains('row-selected')),
    'clicking a transaction selects its source row')
  await source.getByRole('button', { name: 'Next page' }).click()
  await pageNumber.waitFor({ state: 'visible' })
  await assertEventually(async () => (await pageNumber.inputValue()) === '2', 'Next page selects page 2')
  await source.getByRole('button', { name: 'Previous page' }).click()
  await assertEventually(async () => (await pageNumber.inputValue()) === '1', 'Previous page returns to page 1')

  await usCard.click()
  await title.getByText('test_statement_us.pdf', { exact: true }).waitFor({ state: 'visible', timeout: 15_000 })
  await pageTotal.getByText('of 2', { exact: true }).waitFor({ state: 'visible' })
  assert.equal(await pageNumber.inputValue(), '1', 'switching documents resets the preview to page 1')
  assert.equal(await page.locator('.table-wrap tbody tr.row-selected').count(), 0,
    'switching documents clears the previous selected row')

  const previewToggle = page.getByLabel('Show source PDF')
  await previewToggle.click({ force: true })
  await source.waitFor({ state: 'hidden', timeout: 10_000 })
  await previewToggle.waitFor({ state: 'visible' })
  assert.equal(await previewToggle.isChecked(), false, 'closing the preview clears the visible source panel')
  await previewToggle.click({ force: true })
  await source.waitFor({ state: 'visible', timeout: 10_000 })
  await title.getByText('test_statement_us.pdf', { exact: true }).waitFor({ state: 'visible', timeout: 15_000 })
  await pageTotal.getByText('of 2', { exact: true }).waitFor({ state: 'visible' })

  assert.deepEqual(pageErrors, [], 'source preview navigation produces no uncaught browser errors')
  console.log('Source preview browser regression passed: synthetic two-page PDFs switch correctly; row selection, page controls, empty selection, and close/reopen remain stable.')
  await page.close()
} finally {
  await browser?.close()
  await server.close()
}

async function assertEventually(predicate, message) {
  const timeoutAt = Date.now() + 5_000
  while (Date.now() < timeoutAt) {
    if (await predicate()) return
    await new Promise((resolveWait) => setTimeout(resolveWait, 50))
  }
  assert.fail(message)
}
