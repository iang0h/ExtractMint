import { readFileSync } from 'node:fs'

function fail(field) {
  console.error(`Invalid desktop release version: ${field}`)
  process.exit(1)
}

function readSource(path) {
  try {
    return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
  } catch {
    fail(path)
  }
}

function readJson(path) {
  try {
    return JSON.parse(readSource(path))
  } catch {
    fail(path)
  }
}

const tag = process.argv[2]
if (process.argv.length !== 3 || !/^extractmint-v\d+\.\d+\.\d+$/.test(tag ?? '')) {
  fail('tag')
}
const version = tag.slice('extractmint-v'.length)

const declarations = [
  ['package.json version', readJson('package.json')?.version],
  ['package-lock.json packages[""] version', readJson('package-lock.json')?.packages?.['']?.version],
  ['src-tauri/tauri.conf.json version', readJson('src-tauri/tauri.conf.json')?.version],
]

const cargo = readSource('src-tauri/Cargo.toml')
const packageHeader = /^[ \t]*\[package\][ \t]*(?:#.*)?$/m.exec(cargo)
if (!packageHeader) fail('src-tauri/Cargo.toml [package] version')
const packageSection = cargo.slice(packageHeader.index + packageHeader[0].length).split(/^[ \t]*\[/m)[0]
const cargoVersions = [...packageSection.matchAll(/^[ \t]*version[ \t]*=[ \t]*(["'])([^"'\r\n]+)\1[ \t]*(?:#.*)?$/gm)]
if (cargoVersions.length !== 1) fail('src-tauri/Cargo.toml [package] version')
declarations.push(['src-tauri/Cargo.toml [package] version', cargoVersions[0][2]])

for (const [field, declaredVersion] of declarations) {
  if (declaredVersion !== version) fail(field)
}
