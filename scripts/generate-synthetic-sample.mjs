#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { statementCases } from '../benchmarks/statements/fixtures.mjs'
import { createStatementPdf } from '../benchmarks/statements/pdf-generator.mjs'

const statementCase = statementCases.find(({ id }) => id === 'synthetic-english-ledger')
if (!statementCase) throw new Error('Missing synthetic-english-ledger fixture')

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = resolve(projectRoot, 'public/samples/synthetic-bank-statement.pdf')
await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, createStatementPdf(statementCase))
