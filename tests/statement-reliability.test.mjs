import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { createServer } from 'vite'
import { createColumnStatement, reliabilityMagnitudes } from './fixtures/statement-reliability.mjs'

if (!globalThis.DOMMatrix) {
  const canvas = await import('@napi-rs/canvas')
  globalThis.DOMMatrix = canvas.DOMMatrix
  globalThis.Path2D ??= canvas.Path2D
  globalThis.ImageData ??= canvas.ImageData
}

const projectRoot = resolve(new URL('..', import.meta.url).pathname)
const server = await createServer({
  configFile: resolve(projectRoot, 'vite.config.ts'),
  root: projectRoot,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true, include: [] },
  plugins: [
    {
      name: 'statement-reliability-pdf-imports',
      enforce: 'pre',
      resolveId(id) {
        if (id.endsWith('pdfjs-dist/build/pdf.worker.mjs?url')) return '\0statement-reliability-pdf-worker'
        return undefined
      },
      load(id) {
        if (id === '\0statement-reliability-pdf-worker') {
          const workerPath = resolve(projectRoot, 'node_modules/pdfjs-dist/build/pdf.worker.mjs')
          return `export default ${JSON.stringify(workerPath)}`
        }
        return undefined
      },
    },
  ],
})

try {
  const converter = await server.ssrLoadModule('/src/lib/converter.ts')
  for (const fixture of [
    { id: 'synthetic-header-columns', offset: 0 },
    { id: 'synthetic-shifted-columns', offset: 70 },
    { id: 'synthetic-multipage-columns', offset: 0, multiPage: true },
  ]) {
    const file = new File([createColumnStatement(fixture)], `${fixture.id}.pdf`, {
      type: 'application/pdf',
      lastModified: 1,
    })
    const [result] = await converter.convertFiles([file], () => {}, { persistOcrCache: false })
    const transactions = result.rows.filter((row) => row.amount !== undefined)

    assert.equal(transactions.length, reliabilityMagnitudes.length * 2, `${fixture.id}: transaction count`)
    assert.deepEqual(
      transactions.filter((row) => row.withdrawal !== undefined).map((row) => row.withdrawal),
      reliabilityMagnitudes,
      `${fixture.id}: all five synthetic magnitudes are assigned to withdrawals`,
    )
    assert.deepEqual(
      transactions.filter((row) => row.deposit !== undefined).map((row) => row.deposit),
      reliabilityMagnitudes,
      `${fixture.id}: all five synthetic magnitudes are assigned to deposits`,
    )
    assert.deepEqual(
      transactions.map((row) => [row.withdrawal !== undefined, row.deposit !== undefined]),
      Array.from({ length: 10 }, (_, index) => index % 2 === 0 ? [true, false] : [false, true]),
      `${fixture.id}: debit and credit directions follow their columns`,
    )
    assert.equal(result.validation.openingBalance, 250000, `${fixture.id}: stated opening balance`)
    assert.equal(result.validation.closingBalance, result.rows.at(-1)?.balance, `${fixture.id}: closing balance`)
    assert.equal(result.validation.status, 'valid', `${fixture.id}: running balances reconcile`)
    assert.equal(
      transactions.reduce((sum, row) => sum + (row.deposit ?? 0) - (row.withdrawal ?? 0), 0),
      0,
      `${fixture.id}: all five deposits and withdrawals cancel without inferred repair`,
    )
    if (fixture.multiPage) {
      assert.deepEqual(result.pdfColumnMethods, [{ page: 1, method: 'header' }, { page: 2, method: 'header' }])
    }
  }

  const headerlessFile = new File([createColumnStatement({ includeHeaders: false })], 'synthetic-headerless.pdf', {
    type: 'application/pdf',
    lastModified: 1,
  })
  const [headerless] = await converter.convertFiles([headerlessFile], () => {}, { persistOcrCache: false })
  assert.ok(headerless.rows.length > 0, 'headerless synthetic statement still returns rows')
  assert.ok(headerless.confidence < 80, 'headerless column fallback lowers confidence')
  assert.equal(headerless.validation.status, 'review', 'headerless column fallback requires review')

  console.log('Statement reliability geometry regressions passed.')
} finally {
  await server.close()
}
