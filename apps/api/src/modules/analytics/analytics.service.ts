import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type {
  AccountType,
  TransactionType,
} from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  AssetAllocationItem,
  DashboardAccountItem,
  DashboardData,
  DashboardMetrics,
  DashboardUnavailableSection,
  MonthlySummaryItem,
  RecentActivityItem,
} from './analytics.types';

type Decimal = Prisma.Decimal;
const Decimal = Prisma.Decimal;

const accountTypeLabels: Record<AccountType, string> = {
  BANK: 'Bank account',
  CASH_WALLET: 'Cash wallet',
  DIGITAL_WALLET: 'Digital wallet',
  BROKER: 'Broker account',
  CRYPTO_WALLET: 'Crypto wallet',
};

const liquidAccountTypes = new Set<AccountType>([
  'BANK',
  'CASH_WALLET',
  'DIGITAL_WALLET',
]);

const investmentAccountTypes = new Set<AccountType>([
  'BROKER',
  'CRYPTO_WALLET',
]);

const monthNames = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

interface RawAccount {
  readonly id: string;
  readonly name: string;
  readonly type: AccountType;
  readonly currency: string;
  readonly openingBalance: Decimal;
}

interface RawTransaction {
  readonly id: string;
  readonly type: TransactionType;
  readonly accountId: string;
  readonly destinationAccountId: string | null;
  readonly amount: Decimal;
  readonly currency: string;
  readonly occurredAt: Date;
  readonly description: string;
  readonly account: {
    readonly name: string;
  };
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardForUser(user: AuthenticatedUser): Promise<DashboardData> {
    const [accounts, transactions] = await Promise.all([
      this.fetchAccounts(user.id),
      this.fetchTransactions(user.id),
    ]);

    const balances = this.calculateBalances(accounts, transactions);
    const metrics = this.calculateMetrics(accounts, balances, transactions);
    const accountItems = this.buildAccountItems(accounts, balances, metrics);
    const monthlySummary = this.buildMonthlySummary(transactions);
    const recentActivity = this.buildRecentActivity(transactions);
    const assetAllocation = this.buildAssetAllocation(accounts, balances);

    return {
      baseCurrency: user.baseCurrency,
      metrics,
      accounts: accountItems,
      monthlySummary,
      recentActivity,
      assetAllocation,
      unavailable: this.buildUnavailableSections(),
    };
  }

  private async fetchAccounts(userId: string): Promise<readonly RawAccount[]> {
    return this.prisma.account.findMany({
      where: {
        userId,
      },
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true,
        name: true,
        type: true,
        currency: true,
        openingBalance: true,
      },
    });
  }

  private async fetchTransactions(
    userId: string,
  ): Promise<readonly RawTransaction[]> {
    return this.prisma.transaction.findMany({
      where: {
        userId,
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        type: true,
        accountId: true,
        destinationAccountId: true,
        amount: true,
        currency: true,
        occurredAt: true,
        description: true,
        account: {
          select: {
            name: true,
          },
        },
      },
    });
  }

  private calculateBalances(
    accounts: readonly RawAccount[],
    transactions: readonly RawTransaction[],
  ): ReadonlyMap<string, Decimal> {
    const balances = new Map<string, Decimal>();

    for (const account of accounts) {
      balances.set(account.id, account.openingBalance);
    }

    for (const transaction of transactions) {
      const sourceEffect = getSourceAccountEffect(transaction);
      const sourceBalance =
        balances.get(transaction.accountId) ?? new Decimal(0);
      balances.set(transaction.accountId, sourceBalance.add(sourceEffect));

      if (
        transaction.destinationAccountId &&
        hasDestinationBalanceEffect(transaction.type)
      ) {
        const destinationBalance =
          balances.get(transaction.destinationAccountId) ?? new Decimal(0);
        balances.set(
          transaction.destinationAccountId,
          destinationBalance.add(transaction.amount),
        );
      }
    }

    return balances;
  }

  private calculateMetrics(
    accounts: readonly RawAccount[],
    balances: ReadonlyMap<string, Decimal>,
    transactions: readonly RawTransaction[],
  ): DashboardMetrics {
    const totalNetWorth = accounts.reduce(
      (sum, account) => sum.add(balances.get(account.id) ?? new Decimal(0)),
      new Decimal(0),
    );

    const liquidCash = accounts
      .filter((account) => liquidAccountTypes.has(account.type))
      .reduce(
        (sum, account) => sum.add(balances.get(account.id) ?? new Decimal(0)),
        new Decimal(0),
      );

    const investedCash = accounts
      .filter((account) => investmentAccountTypes.has(account.type))
      .reduce(
        (sum, account) => sum.add(balances.get(account.id) ?? new Decimal(0)),
        new Decimal(0),
      );

    const liquidCashPercent = totalNetWorth.isZero()
      ? 0
      : liquidCash
          .dividedBy(totalNetWorth)
          .times(100)
          .toDecimalPlaces(1)
          .toNumber();

    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const currentMonthNetWorthChange = this.calculateNetWorthChange(
      transactions,
      currentMonthStart,
    );

    const previousMonthEndNetWorth = totalNetWorth.sub(
      currentMonthNetWorthChange,
    );
    const totalNetWorthChangePercent = previousMonthEndNetWorth.isZero()
      ? null
      : currentMonthNetWorthChange
          .dividedBy(previousMonthEndNetWorth)
          .times(100)
          .toDecimalPlaces(1)
          .toNumber();

    const investedCashThisMonth = this.sumByTypeAndPeriod(
      transactions,
      ['INVESTMENT_BUY'],
      currentMonthStart,
    );

    return {
      totalNetWorth: totalNetWorth.toFixed(2),
      liquidCash: liquidCash.toFixed(2),
      investedCash: investedCash.toFixed(2),
      totalNetWorthChangePercent,
      liquidCashPercent,
      investedCashThisMonth: investedCashThisMonth.isZero()
        ? null
        : investedCashThisMonth.toFixed(2),
    };
  }

  private calculateNetWorthChange(
    transactions: readonly RawTransaction[],
    start: Date,
    end?: Date,
  ): Decimal {
    return transactions
      .filter((transaction) => {
        const isAfterStart = transaction.occurredAt >= start;
        const isBeforeEnd = end ? transaction.occurredAt < end : true;
        return isAfterStart && isBeforeEnd;
      })
      .reduce((sum, transaction) => {
        switch (transaction.type) {
          case 'INCOME':
            return sum.add(transaction.amount);
          case 'EXPENSE':
          case 'FEE':
            return sum.sub(transaction.amount);
          case 'ADJUSTMENT':
            return sum.add(transaction.amount);
          case 'REFUND':
          case 'INVESTMENT_SELL':
            return sum.add(transaction.amount);
          case 'INVESTMENT_BUY':
          case 'TRANSFER':
            return sum;
          default:
            return sum;
        }
      }, new Decimal(0));
  }

  private sumByTypeAndPeriod(
    transactions: readonly RawTransaction[],
    types: readonly TransactionType[],
    start: Date,
    end?: Date,
  ): Decimal {
    const typeSet = new Set<TransactionType>(types);

    return transactions
      .filter((transaction) => {
        const isAfterStart = transaction.occurredAt >= start;
        const isBeforeEnd = end ? transaction.occurredAt < end : true;
        return typeSet.has(transaction.type) && isAfterStart && isBeforeEnd;
      })
      .reduce(
        (sum, transaction) => sum.add(transaction.amount),
        new Decimal(0),
      );
  }

  private buildAccountItems(
    accounts: readonly RawAccount[],
    balances: ReadonlyMap<string, Decimal>,
    metrics: DashboardMetrics,
  ): readonly DashboardAccountItem[] {
    const totalNetWorth = new Decimal(metrics.totalNetWorth);

    return accounts.map((account) => {
      const balance = balances.get(account.id) ?? new Decimal(0);
      const share = totalNetWorth.isZero()
        ? 0
        : balance
            .dividedBy(totalNetWorth)
            .times(100)
            .toDecimalPlaces(1)
            .toNumber();

      return {
        id: account.id,
        name: account.name,
        type: account.type,
        typeLabel: accountTypeLabels[account.type],
        balance: balance.toFixed(2),
        currency: account.currency,
        share,
      };
    });
  }

  private buildMonthlySummary(
    transactions: readonly RawTransaction[],
  ): readonly MonthlySummaryItem[] {
    const now = new Date();
    const months: MonthlySummaryItem[] = [];

    for (let index = 5; index >= 0; index--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - index, 1);
      const monthEnd = new Date(
        monthStart.getFullYear(),
        monthStart.getMonth() + 1,
        1,
      );
      const label = monthNames[monthStart.getMonth()] ?? 'Unknown';

      const income = this.sumByTypeAndPeriod(
        transactions,
        ['INCOME'],
        monthStart,
        monthEnd,
      );
      const expenses = this.sumByTypeAndPeriod(
        transactions,
        ['EXPENSE', 'FEE'],
        monthStart,
        monthEnd,
      );
      const investments = this.sumByTypeAndPeriod(
        transactions,
        ['INVESTMENT_BUY'],
        monthStart,
        monthEnd,
      );

      months.push({
        month: label,
        income: income.toFixed(2),
        expenses: expenses.toFixed(2),
        investments: investments.toFixed(2),
      });
    }

    return months;
  }

  private buildRecentActivity(
    transactions: readonly RawTransaction[],
  ): readonly RecentActivityItem[] {
    return transactions.slice(0, 5).map((transaction) => {
      const sourceEffect = getSourceAccountEffect(transaction);
      const tone = getActivityTone(transaction.type, sourceEffect);

      return {
        id: transaction.id,
        label: transaction.description,
        account: transaction.account.name,
        amount: sourceEffect.toFixed(2),
        currency: transaction.currency,
        type: transaction.type,
        tone,
        occurredAt: transaction.occurredAt.toISOString(),
      };
    });
  }

  private buildAssetAllocation(
    accounts: readonly RawAccount[],
    balances: ReadonlyMap<string, Decimal>,
  ): readonly AssetAllocationItem[] {
    const totalNetWorth = accounts.reduce(
      (sum, account) => sum.add(balances.get(account.id) ?? new Decimal(0)),
      new Decimal(0),
    );

    const groupBalances = new Map<string, Decimal>();

    for (const account of accounts) {
      const groupName = getAssetAllocationGroup(account.type);
      const balance = balances.get(account.id) ?? new Decimal(0);
      const current = groupBalances.get(groupName) ?? new Decimal(0);
      groupBalances.set(groupName, current.add(balance));
    }

    const groups: AssetAllocationItem[] = [
      { name: 'cash', label: 'Cash & bank', value: 0 },
      { name: 'brokerage', label: 'Brokerage', value: 0 },
      { name: 'crypto', label: 'Crypto', value: 0 },
    ];

    return groups.map((group) => {
      const balance = groupBalances.get(group.name) ?? new Decimal(0);
      const value = totalNetWorth.isZero()
        ? 0
        : balance
            .dividedBy(totalNetWorth)
            .times(100)
            .toDecimalPlaces(1)
            .toNumber();

      return {
        ...group,
        value,
      };
    });
  }

  private buildUnavailableSections(): readonly DashboardUnavailableSection[] {
    return [
      {
        section: 'Expense breakdown',
        reason: 'Categories are not available yet.',
      },
      {
        section: 'Investment performance',
        reason: 'Investment holdings are not available yet.',
      },
      {
        section: 'Goal progress',
        reason: 'Financial goals are not available yet.',
      },
      {
        section: 'Budget progress',
        reason: 'Monthly budgets are not available yet.',
      },
    ];
  }
}

function hasDestinationBalanceEffect(type: TransactionType): boolean {
  return type === 'TRANSFER' || type === 'INVESTMENT_BUY';
}

function getSourceAccountEffect(transaction: RawTransaction): Decimal {
  switch (transaction.type) {
    case 'INCOME':
    case 'REFUND':
    case 'INVESTMENT_SELL':
      return transaction.amount;
    case 'EXPENSE':
    case 'FEE':
    case 'INVESTMENT_BUY':
    case 'TRANSFER':
      return transaction.amount.neg();
    case 'ADJUSTMENT':
      return transaction.amount;
  }
}

function getActivityTone(
  type: TransactionType,
  effect: Decimal,
): RecentActivityItem['tone'] {
  if (type === 'TRANSFER') {
    return 'neutral';
  }

  if (effect.isPositive()) {
    return 'success';
  }

  if (effect.isNegative()) {
    return 'error';
  }

  return 'neutral';
}

function getAssetAllocationGroup(type: AccountType): string {
  if (type === 'BROKER') {
    return 'brokerage';
  }

  if (type === 'CRYPTO_WALLET') {
    return 'crypto';
  }

  return 'cash';
}
