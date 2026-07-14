import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type {
  AccountType,
  TransactionType,
} from '../../generated/prisma/enums';
import { AnalyticsService } from './analytics.service';

jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../../generated/prisma/client', () => ({
  Prisma: {
    Decimal: class Decimal {
      private readonly value: number;

      constructor(input: number | string | Decimal = 0) {
        if (input instanceof Decimal) {
          this.value = input.value;
        } else {
          this.value = typeof input === 'number' ? input : Number(input);
        }
      }

      add(other: Decimal): Decimal {
        return new Decimal(this.value + other.value);
      }

      sub(other: Decimal): Decimal {
        return new Decimal(this.value - other.value);
      }

      neg(): Decimal {
        return new Decimal(-this.value);
      }

      isZero(): boolean {
        return this.value === 0;
      }

      isPositive(): boolean {
        return this.value > 0;
      }

      isNegative(): boolean {
        return this.value < 0;
      }

      dividedBy(other: Decimal): Decimal {
        return new Decimal(this.value / other.value);
      }

      times(factor: number): Decimal {
        return new Decimal(this.value * factor);
      }

      toDecimalPlaces(places: number): Decimal {
        const multiplier = 10 ** places;
        return new Decimal(Math.round(this.value * multiplier) / multiplier);
      }

      toNumber(): number {
        return this.value;
      }

      toFixed(places: number): string {
        return this.value.toFixed(places);
      }

      toString(): string {
        return String(this.value);
      }
    },
  },
}));

interface DecimalInstance {
  add(other: DecimalInstance): DecimalInstance;
  sub(other: DecimalInstance): DecimalInstance;
  neg(): DecimalInstance;
  isZero(): boolean;
  isPositive(): boolean;
  isNegative(): boolean;
  dividedBy(other: DecimalInstance): DecimalInstance;
  times(factor: number): DecimalInstance;
  toDecimalPlaces(places: number): DecimalInstance;
  toNumber(): number;
  toFixed(places: number): string;
}

interface MockPrismaModule {
  Prisma: {
    Decimal: new (input?: number | string | DecimalInstance) => DecimalInstance;
  };
}

const { Prisma } = jest.requireMock<MockPrismaModule>(
  '../../generated/prisma/client',
);
const Decimal = Prisma.Decimal;

const authenticatedUser: AuthenticatedUser = {
  id: 'user-1',
  clerkId: 'clerk_123',
  email: 'user@example.com',
  name: 'Test User',
  baseCurrency: 'USD',
  exchangeRate: null,
};

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: {
    account: {
      findMany: jest.Mock;
    };
    transaction: {
      findMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      account: {
        findMany: jest.fn(),
      },
      transaction: {
        findMany: jest.fn(),
      },
    };

    service = new AnalyticsService(prisma as never);
  });

  it('returns zero metrics when the user has no accounts', async () => {
    prisma.account.findMany.mockResolvedValue([]);
    prisma.transaction.findMany.mockResolvedValue([]);

    const dashboard = await service.getDashboardForUser(authenticatedUser);

    expect(dashboard.baseCurrency).toBe('USD');
    expect(dashboard.metrics.totalNetWorth).toBe('0.00');
    expect(dashboard.metrics.liquidCash).toBe('0.00');
    expect(dashboard.metrics.investedCash).toBe('0.00');
    expect(dashboard.accounts).toEqual([]);
    expect(dashboard.assetAllocation).toEqual([
      { name: 'cash', label: 'Cash & bank', value: 0 },
      { name: 'brokerage', label: 'Brokerage', value: 0 },
      { name: 'crypto', label: 'Crypto', value: 0 },
    ]);
  });

  it('calculates balances from opening balances and transactions', async () => {
    const bankAccount = createAccount('bank-1', 'BANK', '1000');
    const brokerAccount = createAccount('broker-1', 'BROKER', '5000');

    prisma.account.findMany.mockResolvedValue([bankAccount, brokerAccount]);
    prisma.transaction.findMany.mockResolvedValue([
      createTransaction('income-1', 'INCOME', 'bank-1', null, '2000'),
      createTransaction('expense-1', 'EXPENSE', 'bank-1', null, '500'),
      createTransaction('buy-1', 'INVESTMENT_BUY', 'bank-1', null, '1500'),
      createTransaction('transfer-1', 'TRANSFER', 'bank-1', 'broker-1', '1000'),
    ]);

    const dashboard = await service.getDashboardForUser(authenticatedUser);

    // bank: 1000 + 2000 - 500 - 1500 - 1000 = 0
    // broker: 5000 + 1000 = 6000
    // total: 6000
    expect(dashboard.metrics.totalNetWorth).toBe('6000.00');
    expect(dashboard.metrics.liquidCash).toBe('0.00');
    expect(dashboard.metrics.investedCash).toBe('6000.00');

    const bankBalance = dashboard.accounts.find(
      (account) => account.id === 'bank-1',
    );
    const brokerBalance = dashboard.accounts.find(
      (account) => account.id === 'broker-1',
    );

    expect(bankBalance?.balance).toBe('0.00');
    expect(brokerBalance?.balance).toBe('6000.00');
  });

  it('treats transfers as internal movements that do not change net worth', async () => {
    const bankAccount = createAccount('bank-1', 'BANK', '5000');
    const cashAccount = createAccount('cash-1', 'CASH_WALLET', '0');

    prisma.account.findMany.mockResolvedValue([bankAccount, cashAccount]);
    prisma.transaction.findMany.mockResolvedValue([
      createTransaction('transfer-1', 'TRANSFER', 'bank-1', 'cash-1', '2000'),
    ]);

    const dashboard = await service.getDashboardForUser(authenticatedUser);

    expect(dashboard.metrics.totalNetWorth).toBe('5000.00');
    expect(dashboard.metrics.liquidCash).toBe('5000.00');
  });

  it('treats investment purchases as asset shifts, not expenses', async () => {
    const bankAccount = createAccount('bank-1', 'BANK', '10000');
    const brokerAccount = createAccount('broker-1', 'BROKER', '0');

    prisma.account.findMany.mockResolvedValue([bankAccount, brokerAccount]);
    prisma.transaction.findMany.mockResolvedValue([
      createTransaction(
        'buy-1',
        'INVESTMENT_BUY',
        'bank-1',
        'broker-1',
        '3000',
      ),
    ]);

    const dashboard = await service.getDashboardForUser(authenticatedUser);

    expect(dashboard.metrics.totalNetWorth).toBe('10000.00');
    expect(dashboard.metrics.liquidCash).toBe('7000.00');
    expect(dashboard.metrics.investedCash).toBe('3000.00');
  });

  it('includes reversals in balance calculations', async () => {
    const bankAccount = createAccount('bank-1', 'BANK', '1000');

    prisma.account.findMany.mockResolvedValue([bankAccount]);
    prisma.transaction.findMany.mockResolvedValue([
      createTransaction('expense-1', 'EXPENSE', 'bank-1', null, '400'),
      createTransaction(
        'reversal-1',
        'EXPENSE',
        'bank-1',
        null,
        '-400',
        'Reversal',
      ),
    ]);

    const dashboard = await service.getDashboardForUser(authenticatedUser);

    expect(dashboard.metrics.totalNetWorth).toBe('1000.00');
  });

  it('aggregates monthly income, expenses, and investments', async () => {
    const bankAccount = createAccount('bank-1', 'BANK', '0');
    const now = new Date();
    const currentMonthLabel = now.toLocaleDateString('en', { month: 'short' });

    prisma.account.findMany.mockResolvedValue([bankAccount]);
    prisma.transaction.findMany.mockResolvedValue([
      createTransaction(
        'income-1',
        'INCOME',
        'bank-1',
        null,
        '5000',
        'Salary',
        now,
      ),
      createTransaction(
        'expense-1',
        'EXPENSE',
        'bank-1',
        null,
        '1200',
        'Rent',
        now,
      ),
      createTransaction('fee-1', 'FEE', 'bank-1', null, '50', 'Fee', now),
      createTransaction(
        'buy-1',
        'INVESTMENT_BUY',
        'bank-1',
        null,
        '1500',
        'Buy',
        now,
      ),
    ]);

    const dashboard = await service.getDashboardForUser(authenticatedUser);

    const currentMonth = dashboard.monthlySummary.find(
      (summary) => summary.month === currentMonthLabel,
    );

    expect(currentMonth).toEqual({
      month: currentMonthLabel,
      income: '5000.00',
      expenses: '1250.00',
      investments: '1500.00',
    });
  });

  it('lists recent activity ordered by occurrence date', async () => {
    const bankAccount = createAccount('bank-1', 'BANK', '0');
    const now = new Date();

    prisma.account.findMany.mockResolvedValue([bankAccount]);
    prisma.transaction.findMany.mockResolvedValue([
      createTransaction(
        'income-1',
        'INCOME',
        'bank-1',
        null,
        '1000',
        'Salary',
        now,
      ),
      createTransaction(
        'expense-1',
        'EXPENSE',
        'bank-1',
        null,
        '250',
        'Groceries',
        new Date(now.getTime() - 86_400_000),
      ),
    ]);

    const dashboard = await service.getDashboardForUser(authenticatedUser);

    expect(dashboard.recentActivity).toHaveLength(2);
    expect(dashboard.recentActivity[0]).toEqual(
      expect.objectContaining({
        label: 'Salary',
        amount: '1000.00',
        tone: 'success',
      }),
    );
    expect(dashboard.recentActivity[1]).toEqual(
      expect.objectContaining({
        label: 'Groceries',
        amount: '-250.00',
        tone: 'error',
      }),
    );
  });

  it('marks transfers as neutral in recent activity', async () => {
    const bankAccount = createAccount('bank-1', 'BANK', '2000');
    const cashAccount = createAccount('cash-1', 'CASH_WALLET', '0');
    const now = new Date();

    prisma.account.findMany.mockResolvedValue([bankAccount, cashAccount]);
    prisma.transaction.findMany.mockResolvedValue([
      createTransaction(
        'transfer-1',
        'TRANSFER',
        'bank-1',
        'cash-1',
        '500',
        'ATM withdrawal',
        now,
      ),
    ]);

    const dashboard = await service.getDashboardForUser(authenticatedUser);

    expect(dashboard.recentActivity[0]).toEqual(
      expect.objectContaining({
        label: 'ATM withdrawal',
        amount: '-500.00',
        tone: 'neutral',
      }),
    );
  });

  it('reports unavailable sections for features without database support', async () => {
    prisma.account.findMany.mockResolvedValue([]);
    prisma.transaction.findMany.mockResolvedValue([]);

    const dashboard = await service.getDashboardForUser(authenticatedUser);

    expect(dashboard.unavailable).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ section: 'Expense breakdown' }),
        expect.objectContaining({ section: 'Investment performance' }),
        expect.objectContaining({ section: 'Goal progress' }),
        expect.objectContaining({ section: 'Budget progress' }),
      ]),
    );
  });
});

function createAccount(id: string, type: AccountType, openingBalance: string) {
  return {
    id,
    name: `${type} Account`,
    type,
    currency: 'USD',
    openingBalance: new Decimal(openingBalance),
  };
}

function createTransaction(
  id: string,
  type: TransactionType,
  accountId: string,
  destinationAccountId: string | null,
  amount: string,
  description = 'Transaction',
  occurredAt = new Date(),
) {
  return {
    id,
    type,
    accountId,
    destinationAccountId,
    amount: new Decimal(amount),
    currency: 'USD',
    occurredAt,
    description,
    account: {
      name: 'Account',
    },
  };
}
