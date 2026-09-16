import { parseWalletCsvV1 } from './wallet-csv-v1';

const header =
  'account;category;currency;amount;ref_currency_amount;type;payment_type;note;date;transfer;payee;labels';
const row = (values: Partial<Record<string, string>> = {}) =>
  [
    values.account ?? 'Cash',
    values.category ?? 'Food',
    values.currency ?? 'PKR',
    values.amount ?? '10',
    values.reference ?? values.amount ?? '10',
    values.type ?? 'Expense',
    'Cash',
    values.note ?? '',
    values.date ?? '2026-09-07T00:00:00.000Z',
    values.transfer ?? 'false',
    values.payee ?? '',
    values.labels ?? '',
  ].join(';');

describe('parseWalletCsvV1', () => {
  it('normalizes BOM/CRLF rows, labels, and a paired transfer', () => {
    const csv = `\uFEFF${header}\r\n${row({ account: 'Meezan', amount: '100.00', type: 'Expense', transfer: 'true', date: '2026-09-08T00:00:00.000Z' })}\r\n${row({ account: 'Cash', amount: '100', type: 'Income', transfer: 'true', date: '2026-09-08T00:00:00.000Z' })}\r\n${row({ note: '"coffee; tea"', labels: 'home, food, home' })}`;
    const result = parseWalletCsvV1(csv);
    expect(result.rows).toHaveLength(3);
    expect(result.items).toHaveLength(2);
    expect(result.items.find((item) => item.type === 'TRANSFER')).toMatchObject(
      { amount: '100', sourceLines: [2, 3] },
    );
    expect(result.items.find((item) => item.type === 'EXPENSE')).toMatchObject({
      labels: ['home', 'food'],
    });
  });

  it('leaves ambiguous transfer groups unresolved', () => {
    const csv = [
      header,
      row({ account: 'A', transfer: 'true' }),
      row({ account: 'B', transfer: 'true', type: 'Income' }),
      row({ account: 'C', transfer: 'true', type: 'Income' }),
    ].join('\n');
    const result = parseWalletCsvV1(csv);
    expect(result.items).toHaveLength(3);
    expect(result.items.every((item) => item.unresolved)).toBe(true);
  });

  it('rejects malformed headers and invalid monetary precision', () => {
    expect(() => parseWalletCsvV1('account;amount\nCash;10')).toThrow(
      'Unexpected wallet CSV headers',
    );
    expect(() =>
      parseWalletCsvV1([header, row({ amount: '1.123456789' })].join('\n')),
    ).toThrow('invalid amount');
  });
});
