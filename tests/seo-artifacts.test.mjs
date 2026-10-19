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
const analytics = readText('src/lib/analytics.ts')
const packageJson = JSON.parse(readText('package.json'))
const privacyHtml = readText('public/privacy/index.html')
const privacyMarkdown = readText('public/privacy/index.md')
const guideHtml = readText('public/convert/bank-statement-to-excel/index.html')
const guideMarkdown = readText('public/convert/bank-statement-to-excel/index.md')
const pdfGuideHtml = readText('public/convert/pdf-bank-statement-to-excel/index.html')
const pdfGuideMarkdown = readText('public/convert/pdf-bank-statement-to-excel/index.md')
const scannedGuideHtml = readText('public/convert/scanned-bank-statement-to-excel/index.html')
const scannedGuideMarkdown = readText('public/convert/scanned-bank-statement-to-excel/index.md')
const homepageMarkdown = readText('public/index.md')
const retiredBankSlugs = ['cimb-bank-statement-to-excel', 'maybank-bank-statement-to-excel', 'singapore-bank-statement-to-excel']

const expectedSitemapUrls = [
  `${origin}/`,
  `${origin}/pricing/`,
  `${origin}/privacy/`,
  `${origin}/security/`,
  `${origin}/convert/bank-statement-to-excel/`,
  `${origin}/convert/pdf-bank-statement-to-excel/`,
  `${origin}/convert/scanned-bank-statement-to-excel/`,
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

const bankRedirects = vercel.redirects.filter((entry) => retiredBankSlugs.some((slug) => entry.source === `/convert/${slug}/`))
assert.equal(bankRedirects.length, 3, 'Only the three retired bank-specific routes should redirect')
for (const slug of retiredBankSlugs) {
  const source = `/convert/${slug}/`
  const redirect = bankRedirects.find((entry) => entry.source === source)
  assert.ok(redirect, `${source} needs a redirect`)
  assert.equal(redirect.destination, '/convert/bank-statement-to-excel/#bank-format-limitations')
  assert.equal(redirect.permanent, true)
  assert.equal(redirect.has, undefined, 'Bank redirects should apply on the canonical host too')
  assert.ok(!sitemap.includes(`/${slug}/`), `${slug} must leave the sitemap`)
  assert.ok(!llms.includes(`/${slug}/`), `${slug} must leave llms.txt`)
  assert.ok(!homepageMarkdown.includes(`/${slug}/`), `${slug} must leave the homepage Markdown`)
}
assert.ok(vercel.redirects.slice(0, 3).every((entry) => entry.has?.some((condition) => condition.type === 'host')), 'Legacy-host redirects must retain priority')

for (const [path, guide] of [['guide HTML', guideHtml], ['guide Markdown', guideMarkdown]]) {
  assert.match(guide, /Try a synthetic example/i, `${path} needs a sample CTA`)
  assert.match(guide, /#load-synthetic-sample/, `${path} must target the stable sample action`)
  for (const transaction of ['Studio supplies', 'Project credit', 'Service charge']) {
    assert.match(guide, new RegExp(transaction), `${path} needs the invented transaction table`)
  }
  assert.match(guide, /1,000\.00[\s\S]*300\.00[\s\S]*125\.50[\s\S]*62\.00[\s\S]*1,112\.50/, `${path} needs the fixture balance equation`)
  assert.match(guide, /invented/i, `${path} must label sample figures as invented`)
  assert.match(guide, /statement period/i, `${path} needs a review checklist`)
  assert.match(guide, /debit.{0,30}credit/i, `${path} must call out transaction direction`)
  assert.match(guide, /running balance/i, `${path} must call out running balance review`)
  assert.match(guide, /Excel XLSX/i, `${path} needs the output list`)
  assert.match(guide, /\/privacy\//, `${path} needs the privacy data-flow link`)
  assert.match(guide, /six synthetic transaction rows/i, `${path} needs the bounded benchmark`)
  assert.match(guide, /real-bank coverage/i, `${path} must bound the benchmark`)
  assert.match(guide, /scanned-PDF OCR/i, `${path} must bound the benchmark`)
  assert.match(guide, /production accuracy/i, `${path} must bound the benchmark`)
  assert.match(guide, /bank-format-limitations/, `${path} needs the bank-format limitations anchor`)
  assert.match(guide, /no bank-specific format has been independently validated/i, `${path} must disclose bank-format limits`)
}

for (const [path, page] of [
  ['PDF guide HTML', pdfGuideHtml],
  ['PDF guide Markdown', pdfGuideMarkdown],
  ['scanned guide HTML', scannedGuideHtml],
  ['scanned guide Markdown', scannedGuideMarkdown],
]) {
  assert.match(page, /no bank-specific format has been independently validated/i, `${path} must disclose bank-format limits`)
  assert.doesNotMatch(page, /(?:cimb|maybank|singapore)-bank-statement-to-excel/i, `${path} must not link to retired bank-specific routes`)
}

for (const [path, page] of [['PDF guide HTML', pdfGuideHtml], ['PDF guide Markdown', pdfGuideMarkdown]]) {
  assert.match(page, /select(?:able)? text/i, `${path} should help readers distinguish text PDFs from scans`)
  assert.match(page, /runs? (?:locally|in your browser)/i, `${path} should explain where core conversion runs`)
  assert.match(page, /opening and closing balances/i, `${path} should give a concrete review step`)
  assert.match(page, /scanned-bank-statement-to-excel/i, `${path} should link readers who need OCR`)
}

for (const [path, page] of [['scanned guide HTML', scannedGuideHtml], ['scanned guide Markdown', scannedGuideMarkdown]]) {
  assert.match(page, /Force OCR/i, `${path} should explain the OCR control`)
  assert.match(page, /English/i, `${path} should list supported OCR languages`)
  assert.match(page, /Malay/i, `${path} should list supported OCR languages`)
  assert.match(page, /Indonesian/i, `${path} should list supported OCR languages`)
  assert.match(page, /Chinese \(Simplified\)/i, `${path} should list supported OCR languages`)
  assert.match(page, /minus signs|negative amounts/i, `${path} should warn readers what to verify after OCR`)
  assert.doesNotMatch(page, /Future upgrade/i, `${path} should not expose an internal product roadmap`)
  assert.match(page, /pdf-bank-statement-to-excel/i, `${path} should link readers with searchable PDFs`)
}

const homepageGraph = JSON.parse(homepage.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] ?? '{}')['@graph']
assert.ok(Array.isArray(homepageGraph), 'Homepage structured data must have a graph')
for (const type of ['WebSite', 'Organization', 'SoftwareApplication', 'FAQPage']) {
  assert.ok(homepageGraph.some((node) => node['@type'] === type), `${type} structured data must remain`)
}
assert.doesNotMatch(JSON.stringify(homepageGraph), /SearchAction/, 'Homepage cannot advertise a nonexistent search action')

assert.equal(openapi.openapi, '3.1.0')
assert.equal(openapi.info.title, 'ExtractMint Agent API')
assert.equal(openapi.servers[0].url, origin)
assert.ok(openapi.paths['/api/agent/']?.post, 'OpenAPI must document POST /api/agent/')
assert.match(llms, /OpenAPI/)
assert.ok(llms.includes(`${origin}/openapi.json`))

assert.match(homepage, /<title>Free Bank Statement Converter: PDF to Excel &amp; CSV \| ExtractMint<\/title>/)
assert.equal(packageJson.scripts['sample:statement'], 'node scripts/generate-synthetic-sample.mjs')
assert.doesNotMatch(app, /40\+['"], 'file and table patterns'/)
assert.match(app, /When you click Ask, your question and the file name/)
assert.match(app, /up to five extracted rows/)
assert.match(app, /id="load-synthetic-sample"/)
assert.match(app, /Load synthetic example/)
assert.match(app, /invented figures/i)
assert.match(app, /runs in your browser/i)
assert.match(app, /href=\{SYNTHETIC_SAMPLE_URL\}/)
assert.match(app, /download=\{SYNTHETIC_SAMPLE_FILENAME\}/)

for (const event of ['sample_conversion_started', 'sample_conversion_completed', 'sample_conversion_failed', 'sample_conversion_cancelled']) {
  assert.match(analytics, new RegExp(event))
}

for (const event of ['upload_started', 'conversion_completed', 'export_started']) {
  assert.match(analytics, new RegExp(event))
}

for (const privacyCopy of [privacyHtml, privacyMarkdown]) {
  assert.match(privacyCopy, /Ask ExtractMint/)
  assert.match(privacyCopy, /up to five extracted rows/i)
  assert.match(privacyCopy, /AI provider is configured/i)
  assert.match(privacyCopy, /upload_started/)
  assert.match(privacyCopy, /conversion_completed/)
  assert.match(privacyCopy, /export_started/)
  assert.match(privacyCopy, /sample_conversion_started/)
  assert.match(privacyCopy, /sample_conversion_completed/)
  assert.match(privacyCopy, /sample_conversion_failed/)
  assert.match(privacyCopy, /sample_conversion_cancelled/)
  assert.match(privacyCopy, /demo-only events carry no properties/i)
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
