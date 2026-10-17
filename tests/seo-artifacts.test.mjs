import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const readText = (path) => readFileSync(path, 'utf8')
const origin = 'https://extractmint.iangoh.com'

const sitemap = readText('public/sitemap.xml')
const robots = readText('public/robots.txt')
const llms = readText('public/llms.txt')
const vercel = JSON.parse(readText('vercel.json'))
const openapi = JSON.parse(readText('public/openapi.json'))
const homepage = readText('index.html')
const app = readText('src/App.tsx')
const packageJson = JSON.parse(readText('package.json'))
const privacyHtml = readText('public/privacy/index.html')
const privacyMarkdown = readText('public/privacy/index.md')

const expectedSitemapUrls = [
  `${origin}/`,
  `${origin}/pricing/`,
  `${origin}/privacy/`,
  `${origin}/security/`,
  `${origin}/convert/bank-statement-to-excel/`,
  `${origin}/convert/pdf-bank-statement-to-excel/`,
  `${origin}/convert/scanned-bank-statement-to-excel/`,
  `${origin}/convert/cimb-bank-statement-to-excel/`,
  `${origin}/convert/maybank-bank-statement-to-excel/`,
  `${origin}/convert/singapore-bank-statement-to-excel/`,
].sort()

const sitemapUrls = Array.from(sitemap.matchAll(/<loc>(.*?)<\/loc>/g), ([, url]) => url).sort()
assert.deepEqual(sitemapUrls, expectedSitemapUrls)
assert.ok(sitemapUrls.every((url) => !url.endsWith('.md')), 'Sitemap should list canonical HTML pages only')
assert.ok(robots.includes(`Sitemap: ${origin}/sitemap.xml`), 'robots.txt must point to the canonical sitemap')

const canonicalPages = [
  ['index.html', `${origin}/`],
  ['public/pricing/index.html', `${origin}/pricing/`],
  ['public/privacy/index.html', `${origin}/privacy/`],
  ['public/security/index.html', `${origin}/security/`],
  ['public/convert/bank-statement-to-excel/index.html', `${origin}/convert/bank-statement-to-excel/`],
  ['public/convert/pdf-bank-statement-to-excel/index.html', `${origin}/convert/pdf-bank-statement-to-excel/`],
  ['public/convert/scanned-bank-statement-to-excel/index.html', `${origin}/convert/scanned-bank-statement-to-excel/`],
  ['public/convert/cimb-bank-statement-to-excel/index.html', `${origin}/convert/cimb-bank-statement-to-excel/`],
  ['public/convert/maybank-bank-statement-to-excel/index.html', `${origin}/convert/maybank-bank-statement-to-excel/`],
  ['public/convert/singapore-bank-statement-to-excel/index.html', `${origin}/convert/singapore-bank-statement-to-excel/`],
]

for (const [path, expectedCanonical] of canonicalPages) {
  const html = readText(path)
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"\s*\/>/)?.[1]
  assert.equal(canonical, expectedCanonical, `${path} must point to its self-canonical URL`)
  assert.ok(!html.includes('extractmint.vercel.app'), `${path} must not reference the retired host`)
}

const markdownMirrors = [
  `${origin}/index.md`,
  `${origin}/pricing/index.md`,
  `${origin}/privacy/index.md`,
  `${origin}/security/index.md`,
  `${origin}/convert/bank-statement-to-excel/index.md`,
  `${origin}/convert/pdf-bank-statement-to-excel/index.md`,
  `${origin}/convert/scanned-bank-statement-to-excel/index.md`,
  `${origin}/convert/cimb-bank-statement-to-excel/index.md`,
  `${origin}/convert/maybank-bank-statement-to-excel/index.md`,
  `${origin}/convert/singapore-bank-statement-to-excel/index.md`,
]

for (const url of markdownMirrors) assert.ok(llms.includes(url), `${url} must remain discoverable in llms.txt`)

const markdownHeader = vercel.headers.find((entry) => entry.source === '/(.*).md')
assert.ok(markdownHeader, 'Markdown files need a Vercel header contract')
assert.deepEqual(markdownHeader.headers, [
  { key: 'Content-Type', value: 'text/plain; charset=utf-8' },
  { key: 'X-Robots-Tag', value: 'noindex, follow' },
])

for (const hostname of [
  'extractmint\\.vercel\\.app',
  'extractmint-iango\\.vercel\\.app',
  'https-bankstatementconverter-com-bu\\.vercel\\.app',
]) {
  const redirect = vercel.redirects.find((entry) =>
    entry.has?.some((condition) => condition.type === 'host' && condition.value === hostname),
  )
  assert.ok(redirect, `${hostname} must redirect to the canonical domain`)
  assert.equal(redirect.destination, `${origin}/:path*`)
  assert.equal(redirect.permanent, true)
}

assert.equal(openapi.openapi, '3.1.0')
assert.equal(openapi.info.title, 'ExtractMint Agent API')
assert.equal(openapi.servers[0].url, origin)
assert.ok(openapi.paths['/api/agent/']?.post, 'OpenAPI must document POST /api/agent/')
assert.match(llms, /OpenAPI/)
assert.ok(llms.includes(`${origin}/openapi.json`))

assert.match(homepage, /<title>Bank Statement Converter: PDF to Excel &amp; CSV \| ExtractMint<\/title>/)
assert.equal(packageJson.scripts['sample:statement'], 'node scripts/generate-synthetic-sample.mjs')
assert.doesNotMatch(app, /40\+['"], 'file and table patterns'/)
assert.match(app, /When you click Ask, your question and the file name/)
assert.match(app, /up to five extracted rows/)

for (const privacyCopy of [privacyHtml, privacyMarkdown]) {
  assert.match(privacyCopy, /Ask ExtractMint/)
  assert.match(privacyCopy, /up to five extracted rows/i)
  assert.match(privacyCopy, /AI provider is configured/i)
  assert.match(privacyCopy, /upload_started/)
  assert.match(privacyCopy, /conversion_completed/)
  assert.match(privacyCopy, /export_started/)
  assert.match(privacyCopy, /no filenames or statement contents/i)
}

for (const path of [
  'public/convert/cimb-bank-statement-to-excel/index.html',
  'public/convert/maybank-bank-statement-to-excel/index.html',
  'public/convert/singapore-bank-statement-to-excel/index.html',
]) {
  const html = readText(path)
  assert.match(html, /has not been independently validated against real .* statements/i, `${path} must describe the bank-format limitation`)
}

assert.match(llms, /up to five extracted rows/i)
assert.match(llms, /no filenames or statement contents/i)

console.log('seo artifacts tests passed')
