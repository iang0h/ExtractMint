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
    introText: `${inertIntro} Date format: DD/MM/YYYY.`,
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
        date: '2026-04-03',
        description: 'Studio supplies',
        reference: 'SYN-EN-001',
        withdrawal: 125.5,
        deposit: undefined,
        tax: undefined,
        amount: -125.5,
        balance: 874.5,
      },
      {
        date: '2026-04-05',
        description: 'Project credit',
        reference: 'SYN-EN-002',
        withdrawal: undefined,
        deposit: 300,
        tax: undefined,
        amount: 300,
        balance: 1174.5,
      },
      {
        date: '2026-04-07',
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
        date: '2026-04-09',
        description: 'Tambang rekaan',
        reference: 'SYN-MS-001',
        withdrawal: 45,
        deposit: undefined,
        tax: undefined,
        amount: -45,
        balance: 205,
      },
      {
        date: '2026-04-11',
        description: 'Kredit projek',
        reference: 'SYN-MS-002',
        withdrawal: undefined,
        deposit: 80,
        tax: undefined,
        amount: 80,
        balance: 285,
      },
      {
        date: '2026-04-13',
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
  {
    id: 'synthetic-signed-amount-ledger',
    headers: ['Date', 'Description', 'Reference', 'Amount', '', 'Tax', 'Balance'],
    includeHeaders: true,
    introText: `${inertIntro} Date format: DD/MM/YYYY.`,
    openingBalance: 500,
    closingBalance: 535.5,
    tableRows: [
      { kind: 'opening-balance', cells: ['', 'OPENING BALANCE', '', '', '', '', '500.00'] },
      { kind: 'transaction', cells: ['14/04/2026', 'Synthetic credit', 'SYN-SG-001', '+75.50', '', '', '575.50'] },
      { kind: 'transaction', cells: ['15/04/2026', 'Synthetic debit', 'SYN-SG-002', '-40.00', '', '', '535.50'] },
      { kind: 'closing-balance', cells: ['', 'CLOSING BALANCE', '', '', '', '', '535.50'] },
    ],
    expectedRows: [
      { date: '2026-04-14', sourceDate: '14/04/2026', description: 'Synthetic credit', reference: 'SYN-SG-001', withdrawal: undefined, deposit: 75.5, tax: undefined, amount: 75.5, balance: 575.5 },
      { date: '2026-04-15', sourceDate: '15/04/2026', description: 'Synthetic debit', reference: 'SYN-SG-002', withdrawal: 40, deposit: undefined, tax: undefined, amount: -40, balance: 535.5 },
    ],
  },
  {
    id: 'synthetic-debit-credit-ledger',
    headers: ['Date', 'Description', 'Reference', 'Withdrawal', 'Deposit', 'Tax', 'Balance'],
    includeHeaders: true,
    introText: `${inertIntro} Date format: MM/DD/YYYY.`,
    openingBalance: 900,
    closingBalance: 980,
    tableRows: [
      { kind: 'opening-balance', cells: ['', 'OPENING BALANCE', '', '', '', '', '900.00'] },
      { kind: 'transaction', cells: ['04/14/2026', 'Synthetic withdrawal', 'SYN-DC-001', '120.00', '', '', '780.00'] },
      { kind: 'transaction', cells: ['04/15/2026', 'Synthetic deposit', 'SYN-DC-002', '', '200.00', '', '980.00'] },
      { kind: 'closing-balance', cells: ['', 'CLOSING BALANCE', '', '', '', '', '980.00'] },
    ],
    expectedRows: [
      { date: '2026-04-14', sourceDate: '04/14/2026', description: 'Synthetic withdrawal', reference: 'SYN-DC-001', withdrawal: 120, deposit: undefined, tax: undefined, amount: -120, balance: 780 },
      { date: '2026-04-15', sourceDate: '04/15/2026', description: 'Synthetic deposit', reference: 'SYN-DC-002', withdrawal: undefined, deposit: 200, tax: undefined, amount: 200, balance: 980 },
    ],
  },
  {
    id: 'synthetic-multipage-ledger',
    headers: ['Date', 'Description', 'Reference', 'Withdrawal', 'Deposit', 'Tax', 'Balance'],
    includeHeaders: true,
    expectedPageCount: 2,
    introText: `${inertIntro} Date format: MM/DD/YYYY.`,
    openingBalance: 2000,
    closingBalance: 2200,
    tableRows: [
      { kind: 'opening-balance', cells: ['', 'OPENING BALANCE', '', '', '', '', '2000.00'] },
      { kind: 'transaction', cells: ['04/15/2026', 'Synthetic payment', 'SYN-MP-001', '300.00', '', '', '1700.00'] },
      { kind: 'transaction', pageBreakBefore: true, cells: ['04/16/2026', 'Synthetic receipt', 'SYN-MP-002', '', '500.00', '', '2200.00'] },
      { kind: 'closing-balance', cells: ['', 'CLOSING BALANCE', '', '', '', '', '2200.00'] },
    ],
    expectedRows: [
      { date: '2026-04-15', sourceDate: '04/15/2026', description: 'Synthetic payment', reference: 'SYN-MP-001', withdrawal: 300, deposit: undefined, tax: undefined, amount: -300, balance: 1700 },
      { date: '2026-04-16', sourceDate: '04/16/2026', description: 'Synthetic receipt', reference: 'SYN-MP-002', withdrawal: undefined, deposit: 500, tax: undefined, amount: 500, balance: 2200 },
    ],
  },
  {
    id: 'synthetic-mismatched-balance-ledger',
    headers: ['Date', 'Description', 'Reference', 'Withdrawal', 'Deposit', 'Tax', 'Balance'],
    includeHeaders: true,
    introText: `${inertIntro} Date format: DD/MM/YYYY.`,
    openingBalance: 100,
    closingBalance: 70,
    tableRows: [
      { kind: 'opening-balance', cells: ['', 'OPENING BALANCE', '', '', '', '', '100.00'] },
      { kind: 'transaction', cells: ['14/04/2026', 'Synthetic inconsistent debit', 'SYN-BAD-001', '20.00', '', '', '70.00'] },
      { kind: 'closing-balance', cells: ['', 'CLOSING BALANCE', '', '', '', '', '70.00'] },
    ],
    expectedRows: [
      { date: '2026-04-14', sourceDate: '14/04/2026', description: 'Synthetic inconsistent debit', reference: 'SYN-BAD-001', withdrawal: 20, deposit: undefined, tax: undefined, amount: -20, balance: 70 },
    ],
    expectedValidation: 'review',
  },
]
