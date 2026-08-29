import { buildWalletImportPlan } from './wallet-records';

const HEADER =
  'account;category;currency;amount;ref_currency_amount;type;payment_type;note;date;transfer;payee;labels';

describe('buildWalletImportPlan', () => {
  it('normalizes ordinary rows, paired transfers, and unpaired adjustments', () => {
    const csv = createCsv([
      createRow({
        account: 'Cash',
        category: 'Food & Drinks',
        amount: '10',
        type: 'Expense',
        date: '2026-03-01T00:00:00.000Z',
      }),
      createRow({
        account: 'Meezan',
        amount: '100',
        type: 'Expense',
        date: '2026-03-02T00:00:00.000Z',
        transfer: 'true',
      }),
      createRow({
        account: 'ABL',
        amount: '100.00',
        type: 'Income',
        date: '2026-03-02T00:00:00.000Z',
        transfer: 'true',
      }),
      createRow({
        account: 'Binance',
        currency: 'USD',
        amount: '10.08',
        referenceCurrencyAmount: '2933.64',
        type: 'Income',
        date: '2026-03-03T00:00:00.000Z',
        transfer: 'true',
      }),
      createRow({
        account: 'Meezan Cash Fund',
        amount: '50',
        type: 'Income',
        date: '2026-03-04T00:00:00.000Z',
      }),
      createRow({
        account: 'Nayapay',
        amount: '5',
        type: 'Expense',
        note: 'iCloud',
        date: '2026-03-05T00:00:00.000Z',
      }),
      createRow({
        account: 'Stocks',
        amount: '20',
        type: 'Income',
        date: '2026-03-06T00:00:00.000Z',
      }),
    ]);

    const plan = buildWalletImportPlan(csv);

    expect(plan.sourceRowCount).toBe(7);
    expect(plan.ordinaryExpenseCount).toBe(2);
    expect(plan.ordinaryIncomeCount).toBe(2);
    expect(plan.pairedTransferRowCount).toBe(2);
    expect(plan.transferTransactionCount).toBe(1);
    expect(plan.adjustmentTransactionCount).toBe(1);
    expect(plan.transactions).toHaveLength(6);
    expect(plan.accounts).toHaveLength(7);
    expect(plan.derivedBalances).toEqual({
      ABL: '100',
      Binance: '10.08',
      Cash: '-10',
      Meezan: '-100',
      'Meezan Cash Fund': '50',
      Nayapay: '-5',
      Stocks: '20',
    });

    expect(plan.transactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'TRANSFER',
          accountName: 'Meezan',
          destinationAccountName: 'ABL',
          amount: '100',
        }),
        expect.objectContaining({
          type: 'ADJUSTMENT',
          accountName: 'Binance',
          amount: '10.08',
          notes: 'Reference amount from export: PKR 2933.64',
        }),
        expect.objectContaining({
          type: 'EXPENSE',
          accountName: 'Nayapay',
          description: 'Transfer, withdraw',
          notes: 'iCloud',
        }),
      ]),
    );
  });

  it('uses deterministic UUID idempotency keys', () => {
    const csv = createCompleteAccountCsv();

    const firstPlan = buildWalletImportPlan(csv);
    const secondPlan = buildWalletImportPlan(csv);

    expect(
      firstPlan.transactions.map((transaction) => transaction.idempotencyKey),
    ).toEqual(
      secondPlan.transactions.map((transaction) => transaction.idempotencyKey),
    );
    expect(firstPlan.transactions[0].idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('turns an unpaired expense transfer into a negative adjustment', () => {
    const rows = createCompleteAccountRows();
    rows[0] = createRow({
      account: 'ABL',
      amount: '12.34',
      type: 'Expense',
      transfer: 'true',
    });

    const plan = buildWalletImportPlan(createCsv(rows));
    const adjustment = plan.transactions.find(
      (transaction) => transaction.accountName === 'ABL',
    );

    expect(adjustment).toEqual(
      expect.objectContaining({ type: 'ADJUSTMENT', amount: '-12.34' }),
    );
    expect(plan.derivedBalances.ABL).toBe('-12.34');
  });

  it('rejects malformed headers and financial values', () => {
    expect(() => buildWalletImportPlan(`wrong;header\nvalue;value`)).toThrow(
      'Unexpected wallet CSV headers',
    );

    const rows = createCompleteAccountRows();
    rows[0] = createRow({ account: 'ABL', amount: '0' });

    expect(() => buildWalletImportPlan(createCsv(rows))).toThrow(
      'line 2 has an invalid amount',
    );
  });

  it('rejects accounts whose currency differs from the locked mapping', () => {
    const rows = createCompleteAccountRows();
    rows[0] = createRow({ account: 'ABL', currency: 'USD' });

    expect(() => buildWalletImportPlan(createCsv(rows))).toThrow(
      'uses USD for ABL; expected PKR',
    );
  });
});

function createCompleteAccountCsv(): string {
  return createCsv(createCompleteAccountRows());
}

function createCompleteAccountRows(): string[] {
  return [
    createRow({ account: 'ABL' }),
    createRow({ account: 'Binance', currency: 'USD' }),
    createRow({ account: 'Cash' }),
    createRow({ account: 'Meezan' }),
    createRow({ account: 'Meezan Cash Fund' }),
    createRow({ account: 'Nayapay' }),
    createRow({ account: 'Stocks' }),
  ];
}

function createCsv(rows: readonly string[]): string {
  return [HEADER, ...rows].join('\n');
}

function createRow(
  overrides: Partial<{
    readonly account: string;
    readonly category: string;
    readonly currency: string;
    readonly amount: string;
    readonly referenceCurrencyAmount: string;
    readonly type: string;
    readonly paymentType: string;
    readonly note: string;
    readonly date: string;
    readonly transfer: string;
    readonly payee: string;
    readonly labels: string;
  }> = {},
): string {
  const row = {
    account: 'Cash',
    category: 'Transfer, withdraw',
    currency: 'PKR',
    amount: '1',
    referenceCurrencyAmount: overrides.amount ?? '1',
    type: 'Income',
    paymentType: 'Cash',
    note: '',
    date: '2026-03-01T00:00:00.000Z',
    transfer: 'false',
    payee: '',
    labels: '',
    ...overrides,
  };

  return [
    row.account,
    row.category,
    row.currency,
    row.amount,
    row.referenceCurrencyAmount,
    row.type,
    row.paymentType,
    row.note,
    row.date,
    row.transfer,
    row.payee,
    row.labels,
  ].join(';');
}
