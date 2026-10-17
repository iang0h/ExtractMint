import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createElement, Fragment } from 'react'
import { renderToString } from 'react-dom/server'
import { Analytics } from '@vercel/analytics/react'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = new URL('../dist/index.html', import.meta.url)
const html = await readFile(output, 'utf8')
const emptyRoot = /<div id="root">\s*<\/div>/g
const matches = [...html.matchAll(emptyRoot)]

if (matches.length !== 1) {
  throw new Error(`Expected exactly one empty #root in dist/index.html; found ${matches.length}.`)
}

const server = await createServer({
  root,
  server: { middlewareMode: true },
  appType: 'custom',
})

try {
  const { default: App } = await server.ssrLoadModule('/src/App.tsx')
  const markup = renderToString(
    createElement(Fragment, null, createElement(App), createElement(Analytics)),
  )
  await writeFile(output, html.replace(emptyRoot, () => `<div id="root" data-prerendered="true">${markup}</div>`))
} finally {
  await server.close()
}
