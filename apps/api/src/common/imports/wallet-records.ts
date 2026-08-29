import { createHash } from 'node:crypto';

const EXPECTED_HEADERS = [
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

const DECIMAL_SCALE = 100_000_000n;
const POSITIVE_DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/;

export const WALLET_ACCOUNT_CONFIG = {
  ABL: { type: 'BANK', currency: 'PKR' },
  Binance: { type: 'CRYPTO_WALLET', currency: 'USD' },
  Cash: { type: 'CASH_WALLET', currency: 'PKR' },
  Meezan: { type: 'BANK', currency: 'PKR' },
  'Meezan Cash Fund': { type: 'BROKER', currency: 'PKR' },
  Nayapay: { type: 'DIGITAL_WALLET', currency: 'PKR' },
  Stocks: { type: 'BROKER', currency: 'PKR' },
} as const;

export type WalletAccountName = keyof typeof WALLET_ACCOUNT_CONFIG;
export type WalletAccountType =
  (typeof WALLET_ACCOUNT_CONFIG)[WalletAccountName]['type'];

type WalletCurrency = 'PKR' | 'USD';
type WalletRowType = 'Expense' | 'Income';

interface WalletRow {
  readonly sourceLine: number;
  readonly account: WalletAccountName;
  readonly category: string;
  readonly currency: WalletCurrency;
  readonly amount: string;
  readonly referenceCurrencyAmount: string;
  readonly type: WalletRowType;
  readonly paymentType: string;
  readonly note: string;
  readonly occurredAt: string;
  readonly isTransfer: boolean;
  readonly payee: string;
  readonly labels: string;
}

export interface WalletImportAccount {
  readonly name: WalletAccountName;
  readonly type: WalletAccountType;
  readonly currency: WalletCurrency;
  readonly openingBalance: '0';
  readonly openedAt: string;
}

export type WalletImportTransactionType =
  'ADJUSTMENT' | 'EXPENSE' | 'INCOME' | 'TRANSFER';

export interface WalletImportTransaction {
  readonly sourceLines: readonly number[];
  readonly idempotencyKey: string;
  readonly type: WalletImportTransactionType;
  readonly accountName: WalletAccountName;
  readonly destinationAccountName: WalletAccountName | null;
  readonly amount: string;
  readonly currency: WalletCurrency;
  readonly occurredAt: string;
  readonly description: string;
  readonly merchant: string | null;
  readonly notes: string | null;
}

export interface WalletImportPlan {
  readonly sourceRowCount: number;
  readonly ordinaryExpenseCount: number;
  readonly ordinaryIncomeCount: number;
  readonly pairedTransferRowCount: number;
  readonly transferTransactionCount: number;
  readonly adjustmentTransactionCount: number;
  readonly accounts: readonly WalletImportAccount[];
  readonly transactions: readonly WalletImportTransaction[];
  readonly derivedBalances: Readonly<Record<WalletAccountName, string>>;
  readonly dateRange: {
    readonly from: string;
    readonly to: string;
  };
}

export function buildWalletImportPlan(csvText: string): WalletImportPlan {
  const rows = parseWalletRows(csvText);
  const ordinaryRows = rows.filter((row) => !row.isTransfer);
  const transferRows = rows.filter((row) => row.isTransfer);
  const { transfers, adjustments } = normalizeTransfers(transferRows);

  const ordinaryTransactions = ordinaryRows.map((row) =>
    createOrdinaryTransaction(row),
  );
  const transferTransactions = transfers.map(({ expense, income }) =>
    createTransferTransaction(expense, income),
  );
  const adjustmentTransactions = adjustments.map((row) =>
    createAdjustmentTransaction(row),
  );
  const transactions = [
    ...ordinaryTransactions,
    ...transferTransactions,
    ...adjustmentTransactions,
  ].sort(compareTransactions);

  const accounts = createImportAccounts(rows);

  return {
    sourceRowCount: rows.length,
    ordinaryExpenseCount: ordinaryRows.filter((row) => row.type === 'Expense')
      .length,
    ordinaryIncomeCount: ordinaryRows.filter((row) => row.type === 'Income')
      .length,
    pairedTransferRowCount: transfers.length * 2,
    transferTransactionCount: transfers.length,
    adjustmentTransactionCount: adjustments.length,
    accounts,
    transactions,
    derivedBalances: calculateDerivedBalances(transactions),
    dateRange: {
      from: rows.reduce(
        (earliest, row) =>
          row.occurredAt < earliest ? row.occurredAt : earliest,
        rows[0].occurredAt,
      ),
      to: rows.reduce(
        (latest, row) => (row.occurredAt > latest ? row.occurredAt : latest),
        rows[0].occurredAt,
      ),
    },
  };
}

function parseWalletRows(csvText: string): readonly WalletRow[] {
  const normalizedText = csvText.replace(/^\uFEFF/, '');
  const lines = normalizedText.split(/\r?\n/);

  while (lines.at(-1)?.trim() === '') {
    lines.pop();
  }

  if (lines.length < 2) {
    throw new Error(
      'The wallet CSV must contain a header and at least one row.',
    );
  }

  const headers = lines[0].split(';');
  if (
    headers.length !== EXPECTED_HEADERS.length ||
    headers.some((header, index) => header !== EXPECTED_HEADERS[index])
  ) {
    throw new Error(
      `Unexpected wallet CSV headers. Expected: ${EXPECTED_HEADERS.join(';')}`,
    );
  }

  return lines.slice(1).map((line, index) => parseWalletRow(line, index + 2));
}

function parseWalletRow(line: string, sourceLine: number): WalletRow {
  const values = line.split(';');
  if (values.length !== EXPECTED_HEADERS.length) {
    throw new Error(
      `Wallet CSV line ${sourceLine} has ${values.length} columns; expected ${EXPECTED_HEADERS.length}.`,
    );
  }

  const [
    accountValue,
    categoryValue,
    currencyValue,
    amountValue,
    referenceCurrencyAmountValue,
    typeValue,
    paymentType,
    note,
    occurredAtValue,
    transferValue,
    payee,
    labels,
  ] = values;

  if (!isWalletAccountName(accountValue)) {
    throw new Error(
      `Wallet CSV line ${sourceLine} has an unsupported account: ${accountValue || '(empty)'}.`,
    );
  }
  if (!categoryValue || categoryValue.length > 255) {
    throw new Error(
      `Wallet CSV line ${sourceLine} must have a category between 1 and 255 characters.`,
    );
  }
  if (currencyValue !== 'PKR' && currencyValue !== 'USD') {
    throw new Error(
      `Wallet CSV line ${sourceLine} has an unsupported currency: ${currencyValue || '(empty)'}.`,
    );
  }
  if (WALLET_ACCOUNT_CONFIG[accountValue].currency !== currencyValue) {
    throw new Error(
      `Wallet CSV line ${sourceLine} uses ${currencyValue} for ${accountValue}; expected ${WALLET_ACCOUNT_CONFIG[accountValue].currency}.`,
    );
  }

  assertPositiveDecimal(amountValue, sourceLine, 'amount');
  assertPositiveDecimal(
    referenceCurrencyAmountValue,
    sourceLine,
    'reference currency amount',
  );

  if (typeValue !== 'Expense' && typeValue !== 'Income') {
    throw new Error(
      `Wallet CSV line ${sourceLine} has an unsupported type: ${typeValue || '(empty)'}.`,
    );
  }
  if (transferValue !== 'true' && transferValue !== 'false') {
    throw new Error(
      `Wallet CSV line ${sourceLine} has an invalid transfer flag: ${transferValue || '(empty)'}.`,
    );
  }
  if (payee.length > 120) {
    throw new Error(
      `Wallet CSV line ${sourceLine} has a payee over 120 characters.`,
    );
  }
  if (note.length > 1000) {
    throw new Error(
      `Wallet CSV line ${sourceLine} has a note over 1000 characters.`,
    );
  }

  const occurredAt = new Date(occurredAtValue);
  if (
    Number.isNaN(occurredAt.getTime()) ||
    occurredAt.toISOString() !== occurredAtValue
  ) {
    throw new Error(
      `Wallet CSV line ${sourceLine} has an invalid ISO date: ${occurredAtValue || '(empty)'}.`,
    );
  }

  return {
    sourceLine,
    account: accountValue,
    category: categoryValue,
    currency: currencyValue,
    amount: formatDecimal(parseDecimal(amountValue)),
    referenceCurrencyAmount: formatDecimal(
      parseDecimal(referenceCurrencyAmountValue),
    ),
    type: typeValue,
    paymentType,
    note,
    occurredAt: occurredAtValue,
    isTransfer: transferValue === 'true',
    payee,
    labels,
  };
}

function normalizeTransfers(rows: readonly WalletRow[]): {
  readonly transfers: ReadonlyArray<{
    readonly expense: WalletRow;
    readonly income: WalletRow;
  }>;
  readonly adjustments: readonly WalletRow[];
} {
  const groups = new Map<string, WalletRow[]>();

  for (const row of rows) {
    const key = [
      row.occurredAt,
      row.currency,
      row.amount,
      row.referenceCurrencyAmount,
    ].join('\u0000');
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  const transfers: Array<{ expense: WalletRow; income: WalletRow }> = [];
  const adjustments: WalletRow[] = [];

  for (const group of groups.values()) {
    const expenses = group.filter((row) => row.type === 'Expense');
    const incomes = group.filter((row) => row.type === 'Income');

    if (
      group.length === 2 &&
      expenses.length === 1 &&
      incomes.length === 1 &&
      expenses[0].account !== incomes[0].account
    ) {
      transfers.push({ expense: expenses[0], income: incomes[0] });
      continue;
    }

    adjustments.push(...group);
  }

  return { transfers, adjustments };
}

function createOrdinaryTransaction(row: WalletRow): WalletImportTransaction {
  return {
    sourceLines: [row.sourceLine],
    idempotencyKey: createDeterministicUuid(
      `wallet-records:v1:${row.sourceLine}`,
    ),
    type: row.type === 'Expense' ? 'EXPENSE' : 'INCOME',
    accountName: row.account,
    destinationAccountName: null,
    amount: row.amount,
    currency: row.currency,
    occurredAt: row.occurredAt,
    description: row.category,
    merchant: emptyToNull(row.payee),
    notes: createNotes(row),
  };
}

function createTransferTransaction(
  expense: WalletRow,
  income: WalletRow,
): WalletImportTransaction {
  const sourceLines = [expense.sourceLine, income.sourceLine].sort(
    (left, right) => left - right,
  );

  return {
    sourceLines,
    idempotencyKey: createDeterministicUuid(
      `wallet-records:v1:${sourceLines.join('+')}`,
    ),
    type: 'TRANSFER',
    accountName: expense.account,
    destinationAccountName: income.account,
    amount: expense.amount,
    currency: expense.currency,
    occurredAt: expense.occurredAt,
    description: expense.category,
    merchant: emptyToNull(expense.payee || income.payee),
    notes: combineNotes(createNotes(expense), createNotes(income)),
  };
}

function createAdjustmentTransaction(row: WalletRow): WalletImportTransaction {
  const amount =
    row.type === 'Expense'
      ? formatDecimal(-parseDecimal(row.amount))
      : row.amount;

  return {
    sourceLines: [row.sourceLine],
    idempotencyKey: createDeterministicUuid(
      `wallet-records:v1:${row.sourceLine}`,
    ),
    type: 'ADJUSTMENT',
    accountName: row.account,
    destinationAccountName: null,
    amount,
    currency: row.currency,
    occurredAt: row.occurredAt,
    description: row.category,
    merchant: emptyToNull(row.payee),
    notes: createNotes(row),
  };
}

function createImportAccounts(
  rows: readonly WalletRow[],
): readonly WalletImportAccount[] {
  const earliestDateByAccount = new Map<WalletAccountName, string>();

  for (const row of rows) {
    const current = earliestDateByAccount.get(row.account);
    if (!current || row.occurredAt < current) {
      earliestDateByAccount.set(row.account, row.occurredAt);
    }
  }

  return Object.entries(WALLET_ACCOUNT_CONFIG)
    .map(([name, config]) => {
      const accountName = name as WalletAccountName;
      const openedAt = earliestDateByAccount.get(accountName);
      if (!openedAt) {
        throw new Error(`The wallet CSV has no records for ${accountName}.`);
      }

      return {
        name: accountName,
        type: config.type,
        currency: config.currency,
        openingBalance: '0' as const,
        openedAt,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function calculateDerivedBalances(
  transactions: readonly WalletImportTransaction[],
): Readonly<Record<WalletAccountName, string>> {
  const balances = new Map<WalletAccountName, bigint>(
    Object.keys(WALLET_ACCOUNT_CONFIG).map((name) => [
      name as WalletAccountName,
      0n,
    ]),
  );

  const add = (accountName: WalletAccountName, amount: bigint): void => {
    balances.set(accountName, (balances.get(accountName) ?? 0n) + amount);
  };

  for (const transaction of transactions) {
    const amount = parseSignedDecimal(transaction.amount);

    switch (transaction.type) {
      case 'INCOME':
        add(transaction.accountName, amount);
        break;
      case 'EXPENSE':
        add(transaction.accountName, -amount);
        break;
      case 'ADJUSTMENT':
        add(transaction.accountName, amount);
        break;
      case 'TRANSFER':
        add(transaction.accountName, -amount);
        if (!transaction.destinationAccountName) {
          throw new Error(
            'A normalized transfer is missing its destination account.',
          );
        }
        add(transaction.destinationAccountName, amount);
        break;
    }
  }

  return Object.fromEntries(
    [...balances.entries()].map(([name, amount]) => [
      name,
      formatDecimal(amount),
    ]),
  ) as Record<WalletAccountName, string>;
}

function createNotes(row: WalletRow): string | null {
  const notes: string[] = [];
  if (row.note.trim()) {
    notes.push(row.note.trim());
  }
  if (row.currency === 'USD') {
    notes.push(
      `Reference amount from export: PKR ${row.referenceCurrencyAmount}`,
    );
  }

  return notes.length > 0 ? notes.join('\n') : null;
}

function combineNotes(
  left: string | null,
  right: string | null,
): string | null {
  const uniqueNotes = [
    ...new Set([left, right].filter((note) => note !== null)),
  ];
  return uniqueNotes.length > 0 ? uniqueNotes.join('\n') : null;
}

function compareTransactions(
  left: WalletImportTransaction,
  right: WalletImportTransaction,
): number {
  return (
    left.occurredAt.localeCompare(right.occurredAt) ||
    left.sourceLines[0] - right.sourceLines[0]
  );
}

function assertPositiveDecimal(
  value: string,
  sourceLine: number,
  fieldName: string,
): void {
  if (!POSITIVE_DECIMAL_PATTERN.test(value) || parseDecimal(value) <= 0n) {
    throw new Error(
      `Wallet CSV line ${sourceLine} has an invalid ${fieldName}: ${value || '(empty)'}.`,
    );
  }
}

function parseDecimal(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  return (
    BigInt(whole) * DECIMAL_SCALE + BigInt(fraction.padEnd(8, '0').slice(0, 8))
  );
}

function parseSignedDecimal(value: string): bigint {
  return value.startsWith('-')
    ? -parseDecimal(value.slice(1))
    : parseDecimal(value);
}

function formatDecimal(value: bigint): string {
  const isNegative = value < 0n;
  const absoluteValue = isNegative ? -value : value;
  const whole = absoluteValue / DECIMAL_SCALE;
  const fraction = (absoluteValue % DECIMAL_SCALE)
    .toString()
    .padStart(8, '0')
    .replace(/0+$/, '');

  return `${isNegative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

function createDeterministicUuid(value: string): string {
  const bytes = createHash('sha256').update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isWalletAccountName(value: string): value is WalletAccountName {
  return Boolean(
    Object.prototype.hasOwnProperty.call(WALLET_ACCOUNT_CONFIG, value),
  );
}
