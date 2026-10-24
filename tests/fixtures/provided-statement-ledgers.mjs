// Expected rows transcribed from the user-supplied synthetic PDFs. Whitespace
// between visual line continuations is normalized to a single space.
export const providedStatementLedgers = {
  test_statement_us: {
    openingBalance: 5000,
    closingBalance: 7333,
    rows: [
      { date: '01/15/2026', description: 'POS PURCHASE GROCERY MART', withdrawal: 82.45, balance: 4917.55, sourceLines: [6] },
      { date: '01/16/2026', description: 'PAYROLL ACME SDN BHD', deposit: 3250, balance: 8167.55, sourceLines: [7] },
      { date: '01/18/2026', description: 'ATM WITHDRAWAL', withdrawal: 500, balance: 7667.55, sourceLines: [8] },
      { date: '01/20/2026', description: 'ELECTRIC BILL JAN', withdrawal: 1234.56, balance: 6432.99, sourceLines: [13] },
      { date: '01/25/2026', description: 'TRANSFER FROM SAVINGS', deposit: 1000, balance: 7432.99, sourceLines: [14] },
      { date: '01/28/2026', description: 'ONLINE PURCHASE', withdrawal: 99.99, balance: 7333, sourceLines: [15] },
    ],
  },
  test_multiline: {
    openingBalance: 10000,
    closingBalance: 13500,
    rows: [
      { date: '01/05/2026', description: 'WIRE TRANSFER FROM ACME TRADING SDN BHD INVOICE 1042', deposit: 1000, balance: 11000, sourceLines: [6, 7] },
      { date: '01/07/2026', description: 'POS PURCHASE HARDWARE STORE', withdrawal: 250, balance: 10750, sourceLines: [8] },
      { date: '01/10/2026', description: 'PAYROLL SALARY JANUARY 2026 ACME SDN BHD PAYROLL REF P100', deposit: 1500, balance: 12250, sourceLines: [9, 10] },
      { date: '01/12/2026', description: 'ATM WITHDRAWAL CIMB KL SENTRAL BRANCH', withdrawal: 500, balance: 11750, sourceLines: [11, 12] },
      { date: '01/15/2026', description: 'ELECTRIC BILL TNB JANUARY', withdrawal: 300, balance: 11450, sourceLines: [13] },
      { date: '01/18/2026', description: 'TRANSFER FROM SAVINGS ACCOUNT 9876-5432 REF MOVE FUNDS', deposit: 1000, balance: 12450, sourceLines: [14, 19] },
      { date: '01/20/2026', description: 'INSURANCE PREMIUM', withdrawal: 400, balance: 12050, sourceLines: [20] },
      { date: '01/22/2026', description: 'CLIENT PAYMENT INVOICE 2077', deposit: 1000, balance: 13050, sourceLines: [21] },
      { date: '01/25/2026', description: 'PARKING', withdrawal: 50, balance: 13000, sourceLines: [22] },
      { date: '01/28/2026', description: 'REFUND SUPPLIER', deposit: 500, balance: 13500, sourceLines: [23] },
    ],
  },
}

export function completeness132ExpectedRows() {
  return Array.from({ length: 132 }, (_, index) => {
    const transactionId = index + 1
    const id = String(transactionId).padStart(3, '0')
    const amount = transactionId % 2 === 1 ? -100 : 200
    const dateDay = 15 + ((transactionId - 1) % 14)
    const row = {
      date: `01/${String(dateDay).padStart(2, '0')}/2026`,
      description: `DEMO TRANSACTION ${id}`,
      withdrawal: amount < 0 ? 100 : undefined,
      deposit: amount > 0 ? 200 : undefined,
      amount,
      balance: 10000 + Math.floor(transactionId / 2) * 100 - (transactionId % 2 === 1 ? 100 : 0),
      transactionId: id,
    }
    // The source places these exact continuation labels under Description.
    if (transactionId % 5 === 1) row.description += ` INVENTED CONTINUATION REF ${id}`
    return row
  })
}
