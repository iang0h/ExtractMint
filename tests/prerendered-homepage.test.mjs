import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = fileURLToPath(new URL('../', import.meta.url))

test('production homepage includes crawlable content before client JavaScript runs', () => {
  execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'pipe' })

  const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8')
  const body = html.slice(html.indexOf('<body>'), html.indexOf('</body>'))

  assert.match(body, /<div id="root" data-prerendered="true">/)
  assert.match(body, /<h1[^>]*>[\s\S]*Bank statements[\s\S]*to Excel\./)
  assert.match(body, /<a[^>]+href="\/convert\/bank-statement-to-excel\/"[^>]*>Bank statement guide/)
})
