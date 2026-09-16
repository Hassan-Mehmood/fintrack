import { createHash } from 'node:crypto';

export const walletCsvV1Format = 'WALLET_CSV_V1';
export const walletCsvHeaders = [
  'account',
  'category',
  'currency',
  'amount',
  'ref_currency_amount',
  'type',
  'payment_type',
  'note',
  'date',
  'transfer',
  'payee',
  'labels',
] as const;

export type WalletCsvTransactionType =
  'INCOME' | 'EXPENSE' | 'TRANSFER' | 'ADJUSTMENT';
export type WalletCsvResolution = 'SKIP' | 'INCOME' | 'EXPENSE' | 'ADJUSTMENT';

export interface WalletCsvRow {
  readonly line: number;
  readonly account: string;
  readonly accountKey: string;
  readonly category: string;
  readonly currency: string;
  readonly amount: string;
  readonly referenceAmount: string;
  readonly sourceType: 'Income' | 'Expense';
  readonly note: string;
  readonly occurredAt: string;
  readonly transfer: boolean;
  readonly payee: string;
  readonly labels: readonly string[];
  readonly fingerprint: string;
}

export interface WalletCsvItem {
  readonly id: string;
  readonly sourceLines: readonly number[];
  readonly type: WalletCsvTransactionType | null;
  readonly unresolved: boolean;
  readonly accountKey: string;
  readonly destinationAccountKey: string | null;
  readonly category: string;
  readonly currency: string;
  readonly amount: string;
  readonly occurredAt: string;
  readonly merchant: string | null;
  readonly notes: string | null;
  readonly labels: readonly string[];
  readonly fingerprint: string;
  readonly sourceType: 'Income' | 'Expense';
}

export interface WalletCsvParseResult {
  readonly rows: readonly WalletCsvRow[];
  readonly items: readonly WalletCsvItem[];
}

const decimalPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/;

export function parseWalletCsvV1(input: string): WalletCsvParseResult {
  if (Buffer.byteLength(input, 'utf8') > 1_000_000)
    throw new Error('The CSV must be 1 MB or smaller.');
  const records = parseSemicolonCsv(input.replace(/^\uFEFF/, ''));
  if (records.length < 2)
    throw new Error('The CSV must contain a header and at least one row.');
  if (records[0].join('\u0000') !== walletCsvHeaders.join('\u0000'))
    throw new Error(
      `Unexpected wallet CSV headers. Expected: ${walletCsvHeaders.join(';')}`,
    );
  const occurrences = new Map<string, number>();
  const rows = records.slice(1).map((values, index) => {
    const line = index + 2;
    if (values.length !== walletCsvHeaders.length)
      throw new Error(
        `Wallet CSV line ${line} has ${values.length} columns; expected ${walletCsvHeaders.length}.`,
      );
    const [
      account,
      category,
      currency,
      amount,
      referenceAmount,
      sourceType,
      ,
      note,
      occurredAt,
      transfer,
      payee,
      labels,
    ] = values.map((value) => value.trim());
    if (!account || !category || category.length > 255)
      throw new Error(
        `Wallet CSV line ${line} requires an account and category.`,
      );
    if (!['PKR', 'USD'].includes(currency))
      throw new Error(
        `Wallet CSV line ${line} has unsupported currency ${currency || '(empty)'}.`,
      );
    if (
      !decimalPattern.test(amount) ||
      !decimalPattern.test(referenceAmount) ||
      amount === '0'
    )
      throw new Error(`Wallet CSV line ${line} has an invalid amount.`);
    if (sourceType !== 'Income' && sourceType !== 'Expense')
      throw new Error(
        `Wallet CSV line ${line} has unsupported type ${sourceType || '(empty)'}.`,
      );
    if (transfer !== 'true' && transfer !== 'false')
      throw new Error(`Wallet CSV line ${line} has invalid transfer flag.`);
    const date = new Date(occurredAt);
    if (Number.isNaN(date.getTime()) || date.toISOString() !== occurredAt)
      throw new Error(`Wallet CSV line ${line} has an invalid ISO date.`);
    const accountKey = normalizeWalletAccountKey(account);
    const canonical = [
      accountKey,
      category,
      currency,
      normalizeDecimal(amount),
      normalizeDecimal(referenceAmount),
      sourceType,
      note,
      occurredAt,
      transfer,
      payee,
      labels,
    ].join('\u0000');
    const ordinal = (occurrences.get(canonical) ?? 0) + 1;
    occurrences.set(canonical, ordinal);
    return {
      line,
      account,
      accountKey,
      category,
      currency,
      amount: normalizeDecimal(amount),
      referenceAmount: normalizeDecimal(referenceAmount),
      sourceType,
      note,
      occurredAt,
      transfer: transfer === 'true',
      payee,
      labels: splitLabels(labels),
      fingerprint: hash(`${canonical}\u0000${ordinal}`),
    } satisfies WalletCsvRow;
  });
  return { rows, items: normalizeWalletCsvRows(rows) };
}

export function normalizeWalletAccountKey(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase();
}

function normalizeWalletCsvRows(
  rows: readonly WalletCsvRow[],
): readonly WalletCsvItem[] {
  const ordinary = rows
    .filter((row) => !row.transfer)
    .map((row) =>
      toItem(row, row.sourceType === 'Income' ? 'INCOME' : 'EXPENSE'),
    );
  const transferGroups = new Map<string, WalletCsvRow[]>();
  rows
    .filter((row) => row.transfer)
    .forEach((row) => {
      const key = [
        row.occurredAt,
        row.currency,
        row.amount,
        row.referenceAmount,
      ].join('\u0000');
      transferGroups.set(key, [...(transferGroups.get(key) ?? []), row]);
    });
  const transfers = [...transferGroups.values()].flatMap((group) => {
    const expenses = group.filter((row) => row.sourceType === 'Expense');
    const incomes = group.filter((row) => row.sourceType === 'Income');
    if (
      group.length === 2 &&
      expenses.length === 1 &&
      incomes.length === 1 &&
      expenses[0].accountKey !== incomes[0].accountKey
    )
      return [toTransfer(expenses[0], incomes[0])];
    return group.map((row) => toItem(row, null));
  });
  return [...ordinary, ...transfers].sort(
    (left, right) =>
      left.occurredAt.localeCompare(right.occurredAt) ||
      left.id.localeCompare(right.id),
  );
}

function toItem(
  row: WalletCsvRow,
  type: WalletCsvTransactionType | null,
): WalletCsvItem {
  return {
    id: row.fingerprint,
    sourceLines: [row.line],
    type,
    unresolved: type === null,
    accountKey: row.accountKey,
    destinationAccountKey: null,
    category: row.category,
    currency: row.currency,
    amount:
      type === 'ADJUSTMENT' && row.sourceType === 'Expense'
        ? `-${row.amount}`
        : row.amount,
    occurredAt: row.occurredAt,
    merchant: row.payee || null,
    notes: row.note || null,
    labels: row.labels,
    fingerprint: row.fingerprint,
    sourceType: row.sourceType,
  };
}

function toTransfer(
  expense: WalletCsvRow,
  income: WalletCsvRow,
): WalletCsvItem {
  const lines = [expense.line, income.line].sort((a, b) => a - b);
  return {
    ...toItem(expense, 'TRANSFER'),
    id: hash(`${expense.fingerprint}\u0000${income.fingerprint}`),
    fingerprint: hash(`${expense.fingerprint}\u0000${income.fingerprint}`),
    sourceLines: lines,
    destinationAccountKey: income.accountKey,
    notes: [expense.note, income.note].filter(Boolean).join('\n') || null,
    labels: [...new Set([...expense.labels, ...income.labels])],
  };
}

function parseSemicolonCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        value += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else value += char;
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ';') {
      row.push(value);
      value = '';
      continue;
    }
    if (char === '\n') {
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
      continue;
    }
    if (char !== '\r') value += char;
  }
  if (quoted) throw new Error('The CSV contains an unterminated quoted field.');
  if (value !== '' || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

function normalizeDecimal(value: string): string {
  return value.includes('.')
    ? value.replace(/0+$/, '').replace(/\.$/, '')
    : value;
}
function splitLabels(value: string): readonly string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((label) => label.trim())
        .filter(Boolean),
    ),
  ];
}
function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
