import { readFileSync, writeFileSync } from 'node:fs'

function fail(field) {
  console.error(`Invalid published desktop release: ${field}`)
  process.exit(1)
}

const eventPath = process.env.GITHUB_EVENT_PATH
if (!eventPath) fail('GITHUB_EVENT_PATH')

let event
try {
  event = JSON.parse(readFileSync(eventPath, 'utf8'))
} catch {
  fail('event JSON')
}

if (event?.action !== 'published') fail('action')
const release = event.release
if (release?.draft !== false) fail('release.draft')
if (release.prerelease !== false) fail('release.prerelease')
if (typeof release.tag_name !== 'string' || release.tag_name !== release.tag_name.trim() || !/^extractmint-v\d+\.\d+\.\d+$/.test(release.tag_name)) {
  fail('release.tag_name')
}

const requiredAssets = [
  'ExtractMint-macOS-universal.dmg',
  'ExtractMint-Windows-x64-setup.exe',
]
if (!Array.isArray(release.assets) || !requiredAssets.every((name) => release.assets.some((asset) => asset?.name === name))) {
  fail('release.assets')
}
if (typeof release.published_at !== 'string' || !Number.isFinite(Date.parse(release.published_at))) {
  fail('release.published_at')
}

const manifest = {
  available: true,
  version: release.tag_name.slice('extractmint-v'.length),
  releaseTag: release.tag_name,
  publishedAt: release.published_at,
}

writeFileSync(new URL('../public/desktop/downloads.json', import.meta.url), `${JSON.stringify(manifest, null, 2)}\n`)
