import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const readText = (path) => readFileSync(path, 'utf8')

const sitemap = readText('public/sitemap.xml')
const llms = readText('public/llms.txt')
const vercel = JSON.parse(readText('vercel.json'))
const openapi = JSON.parse(readText('public/openapi.json'))

const canonicalBaseUrl = 'https://extractmint.iangoh.com'
const fallbackBaseUrl = 'https://extractmint.vercel.app'

const markdownMirrors = [
  `${canonicalBaseUrl}/index.md`,
  `${canonicalBaseUrl}/pricing/index.md`,
  `${canonicalBaseUrl}/privacy/index.md`,
  `${canonicalBaseUrl}/security/index.md`,
  `${canonicalBaseUrl}/convert/bank-statement-to-excel/index.md`,
  `${canonicalBaseUrl}/convert/pdf-bank-statement-to-excel/index.md`,
  `${canonicalBaseUrl}/convert/scanned-bank-statement-to-excel/index.md`,
  `${canonicalBaseUrl}/convert/cimb-bank-statement-to-excel/index.md`,
  `${canonicalBaseUrl}/convert/maybank-bank-statement-to-excel/index.md`,
  `${canonicalBaseUrl}/convert/singapore-bank-statement-to-excel/index.md`,
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
assert.match(llms, new RegExp(`${canonicalBaseUrl.replaceAll('/', '\\/')}\\/openapi\\.json`))
assert.ok(
  Array.isArray(openapi.servers) &&
    openapi.servers.some((server) => server?.url === canonicalBaseUrl) &&
    openapi.servers.some((server) => server?.url === fallbackBaseUrl),
  'OpenAPI servers must include canonical + fallback base URLs',
)

console.log('seo artifacts tests passed')
