/**
 * Invented, offline-only corpus used to benchmark text extraction from digital PDFs.
 * `tableRows` cells follow the converter's positional order:
 * date, description, reference, withdrawal, deposit, tax, balance.
 * `expectedRows` contain only transaction rows, with the exact parsed values expected
 * from `convertFiles`; amount is positive for deposits and negative for withdrawals.
 */
export const corpusMetadata = {
  synthetic: true,
  name: 'ExtractMint synthetic statement baseline',
  disclaimer: 'All names, references, descriptions, and amounts are invented benchmark data.',
}

// This inert copy text is intentionally longer than 220 non-whitespace characters.
// The PDF generator includes it so the converter stays on its embedded-text path.
const inertIntro =
  'Synthetic statement sample for local software evaluation. This document contains generated explanatory copy for testing text extraction and table alignment. It is not issued by a financial institution and describes no real account, customer, purchase, payment, or financial activity. Keep this notice with the sample when generating a benchmark PDF. The text is intentionally neutral and has no dates or monetary values.'

export const statementCases = [
  {
    id: 'synthetic-english-ledger',
    language: 'en',
    headers: ['Date', 'Description', 'Reference', 'Withdrawal', 'Deposit', 'Tax', 'Balance'],
    introText: inertIntro,
    openingBalance: 1000,
    closingBalance: 1112.5,
    tableRows: [
      {
        kind: 'opening-balance',
        cells: ['', 'OPENING BALANCE', '', '', '', '', '1000.00'],
      },
      {
        kind: 'transaction',
        reference: 'SYN-EN-001',
        cells: ['03/04/2026', 'Studio supplies', 'SYN-EN-001', '125.50', '', '', '874.50'],
      },
      {
        kind: 'transaction',
        reference: 'SYN-EN-002',
        cells: ['05/04/2026', 'Project credit', 'SYN-EN-002', '', '300.00', '', '1174.50'],
      },
      {
        kind: 'transaction',
        reference: 'SYN-EN-003',
        cells: ['07/04/2026', 'Service charge', 'SYN-EN-003', '62.00', '', '', '1112.50'],
      },
      {
        kind: 'closing-balance',
        cells: ['', 'CLOSING BALANCE', '', '', '', '', '1112.50'],
      },
    ],
    expectedRows: [
      {
        date: '03/04/2026',
        description: 'Studio supplies',
        reference: 'SYN-EN-001',
        withdrawal: 125.5,
        deposit: undefined,
        tax: undefined,
        amount: -125.5,
        balance: 874.5,
      },
      {
        date: '05/04/2026',
        description: 'Project credit',
        reference: 'SYN-EN-002',
        withdrawal: undefined,
        deposit: 300,
        tax: undefined,
        amount: 300,
        balance: 1174.5,
      },
      {
        date: '07/04/2026',
        description: 'Service charge',
        reference: 'SYN-EN-003',
        withdrawal: 62,
        deposit: undefined,
        tax: undefined,
        amount: -62,
        balance: 1112.5,
      },
    ],
  },
  {
    id: 'synthetic-malay-ledger',
    language: 'ms',
    headers: ['Tarikh', 'Diskripsi', 'No. Rujukan', 'Pengeluaran', 'Deposit', 'Cukai', 'Baki'],
    introText: inertIntro,
    openingBalance: 250,
    closingBalance: 180,
    tableRows: [
      {
        kind: 'opening-balance',
        cells: ['', 'OPENING BALANCE', '', '', '', '', '250.00'],
      },
      {
        kind: 'transaction',
        reference: 'SYN-MS-001',
        cells: ['09/04/2026', 'Tambang rekaan', 'SYN-MS-001', '45.00', '', '', '205.00'],
      },
      {
        kind: 'transaction',
        reference: 'SYN-MS-002',
        cells: ['11/04/2026', 'Kredit projek', 'SYN-MS-002', '', '80.00', '', '285.00'],
      },
      {
        kind: 'transaction',
        reference: 'SYN-MS-003',
        cells: ['13/04/2026', 'Bayaran rekaan', 'SYN-MS-003', '105.00', '', '', '180.00'],
      },
      {
        kind: 'closing-balance',
        cells: ['', 'CLOSING BALANCE', '', '', '', '', '180.00'],
      },
    ],
    expectedRows: [
      {
        date: '09/04/2026',
        description: 'Tambang rekaan',
        reference: 'SYN-MS-001',
        withdrawal: 45,
        deposit: undefined,
        tax: undefined,
        amount: -45,
        balance: 205,
      },
      {
        date: '11/04/2026',
        description: 'Kredit projek',
        reference: 'SYN-MS-002',
        withdrawal: undefined,
        deposit: 80,
        tax: undefined,
        amount: 80,
        balance: 285,
      },
      {
        date: '13/04/2026',
        description: 'Bayaran rekaan',
        reference: 'SYN-MS-003',
        withdrawal: 105,
        deposit: undefined,
        tax: undefined,
        amount: -105,
        balance: 180,
      },
    ],
  },
]
