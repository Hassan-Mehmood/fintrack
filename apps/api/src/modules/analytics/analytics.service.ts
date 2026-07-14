import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type {
  AccountType,
  TransactionType,
} from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';
import {
  calculateAccountBalance,
  hasDestinationBalanceEffect,
  getSourceAccountEffect,
} from '../../common/financial/transaction-effects';
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

    const converter = new CurrencyConverter(
      user.baseCurrency,
      user.exchangeRate,
    );

    const convertedBalances = this.calculateConvertedBalances(
      accounts,
      transactions,
      converter,
    );
    const metrics = this.calculateMetrics(
      accounts,
      convertedBalances,
      transactions,
      converter,
    );
    const accountItems = this.buildAccountItems(
      accounts,
      convertedBalances,
      metrics,
      converter,
    );
    const monthlySummary = this.buildMonthlySummary(transactions, converter);
    const recentActivity = this.buildRecentActivity(transactions, converter);
    const assetAllocation = this.buildAssetAllocation(
      accounts,
      convertedBalances,
    );

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

  private calculateConvertedBalances(
    accounts: readonly RawAccount[],
    transactions: readonly RawTransaction[],
    converter: CurrencyConverter,
  ): ReadonlyMap<string, Decimal> {
    const balances = new Map<string, Decimal>();

    for (const account of accounts) {
      const balance = calculateAccountBalance(
        account.openingBalance,
        account.id,
        transactions,
      );
      balances.set(account.id, converter.convert(balance, account.currency));
    }

    return balances;
  }

  private calculateMetrics(
    accounts: readonly RawAccount[],
    balances: ReadonlyMap<string, Decimal>,
    transactions: readonly RawTransaction[],
    converter: CurrencyConverter,
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
      converter,
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
      converter,
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
    converter: CurrencyConverter,
    end?: Date,
  ): Decimal {
    return transactions
      .filter((transaction) => {
        const isAfterStart = transaction.occurredAt >= start;
        const isBeforeEnd = end ? transaction.occurredAt < end : true;
        return isAfterStart && isBeforeEnd;
      })
      .reduce((sum, transaction) => {
        const convertedAmount = converter.convert(
          transaction.amount,
          transaction.currency,
        );
        switch (transaction.type) {
          case 'INCOME':
            return sum.add(convertedAmount);
          case 'EXPENSE':
          case 'FEE':
            return sum.sub(convertedAmount);
          case 'ADJUSTMENT':
            return sum.add(convertedAmount);
          case 'REFUND':
          case 'INVESTMENT_SELL':
            return sum.add(convertedAmount);
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
    converter: CurrencyConverter,
    end?: Date,
  ): Decimal {
    const typeSet = new Set<TransactionType>(types);

    return transactions
      .filter((transaction) => {
        const isAfterStart = transaction.occurredAt >= start;
        const isBeforeEnd = end ? transaction.occurredAt < end : true;
        return typeSet.has(transaction.type) && isAfterStart && isBeforeEnd;
      })
      .reduce((sum, transaction) => {
        const convertedAmount = converter.convert(
          transaction.amount,
          transaction.currency,
        );
        return sum.add(convertedAmount);
      }, new Decimal(0));
  }

  private buildAccountItems(
    accounts: readonly RawAccount[],
    balances: ReadonlyMap<string, Decimal>,
    metrics: DashboardMetrics,
    converter: CurrencyConverter,
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
        currency: converter.baseCurrency,
        share,
      };
    });
  }

  private buildMonthlySummary(
    transactions: readonly RawTransaction[],
    converter: CurrencyConverter,
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
        converter,
        monthEnd,
      );
      const expenses = this.sumByTypeAndPeriod(
        transactions,
        ['EXPENSE', 'FEE'],
        monthStart,
        converter,
        monthEnd,
      );
      const investments = this.sumByTypeAndPeriod(
        transactions,
        ['INVESTMENT_BUY'],
        monthStart,
        converter,
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
    converter: CurrencyConverter,
  ): readonly RecentActivityItem[] {
    return transactions.slice(0, 5).map((transaction) => {
      const sourceEffect = getSourceAccountEffect(
        transaction.type,
        transaction.amount,
      );
      const convertedEffect = converter.convert(
        sourceEffect,
        transaction.currency,
      );
      const tone = getActivityTone(transaction.type, sourceEffect);

      return {
        id: transaction.id,
        label: transaction.description,
        account: transaction.account.name,
        amount: convertedEffect.toFixed(2),
        currency: converter.baseCurrency,
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

class CurrencyConverter {
  readonly baseCurrency: string;
  private readonly rate: Decimal | null;

  constructor(baseCurrency: string, exchangeRate: string | null) {
    this.baseCurrency = baseCurrency;
    this.rate = exchangeRate ? new Decimal(exchangeRate) : null;
  }

  convert(amount: Decimal, fromCurrency: string): Decimal {
    if (fromCurrency === this.baseCurrency) {
      return amount;
    }

    if (!this.rate || this.rate.isZero()) {
      return amount;
    }

    // If base is USD and from is PKR: divide by rate (e.g., 280 PKR / 280 = 1 USD)
    // If base is PKR and from is USD: multiply by rate (e.g., 1 USD * 280 = 280 PKR)
    if (this.baseCurrency === 'USD' && fromCurrency === 'PKR') {
      return amount.dividedBy(this.rate).toDecimalPlaces(8);
    }

    if (this.baseCurrency === 'PKR' && fromCurrency === 'USD') {
      return amount.times(this.rate).toDecimalPlaces(8);
    }

    return amount;
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
