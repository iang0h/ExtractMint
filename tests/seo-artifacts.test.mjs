import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const readText = (path) => readFileSync(path, 'utf8')

const sitemap = readText('public/sitemap.xml')
const llms = readText('public/llms.txt')
const vercel = JSON.parse(readText('vercel.json'))
const openapi = JSON.parse(readText('public/openapi.json'))

const markdownMirrors = [
  'https://extractmint.iangoh.com/index.md',
  'https://extractmint.iangoh.com/pricing/index.md',
  'https://extractmint.iangoh.com/privacy/index.md',
  'https://extractmint.iangoh.com/security/index.md',
  'https://extractmint.iangoh.com/convert/bank-statement-to-excel/index.md',
  'https://extractmint.iangoh.com/convert/bank-statement-to-xero-csv/index.md',
  'https://extractmint.iangoh.com/convert/bank-statement-to-qbo/index.md',
  'https://extractmint.iangoh.com/convert/pdf-bank-statement-to-excel/index.md',
  'https://extractmint.iangoh.com/convert/scanned-bank-statement-to-excel/index.md',
  'https://extractmint.iangoh.com/convert/cimb-bank-statement-to-excel/index.md',
  'https://extractmint.iangoh.com/convert/maybank-bank-statement-to-excel/index.md',
  'https://extractmint.iangoh.com/convert/singapore-bank-statement-to-excel/index.md',
]

for (const url of markdownMirrors) {
  assert.match(sitemap, new RegExp(`<loc>${url.replaceAll('/', '\\/')}<\\/loc>`))
  assert.match(llms, new RegExp(url.replaceAll('/', '\\/')))
}

const markdownHeader = vercel.headers.find((entry) => entry.source === '/(.*).md')
assert.ok(markdownHeader, 'Markdown files need a Vercel header contract')
assert.deepEqual(markdownHeader.headers, [
  { key: 'Content-Type', value: 'text/plain; charset=utf-8' },
  { key: 'X-Robots-Tag', value: 'index, follow' },
])

assert.equal(openapi.openapi, '3.1.0')
assert.equal(openapi.info.title, 'ExtractMint Agent API')
assert.ok(openapi.paths['/api/agent/']?.post, 'OpenAPI must document POST /api/agent/')
assert.match(llms, /OpenAPI/)
assert.match(llms, /https:\/\/extractmint\.iangoh\.com\/openapi\.json/)

console.log('seo artifacts tests passed')
