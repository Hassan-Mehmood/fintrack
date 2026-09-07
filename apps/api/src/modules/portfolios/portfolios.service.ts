import { Injectable, Optional } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { calculateAccountBalance } from '../../common/financial/transaction-effects';
import {
  calculateHolding,
  type InvestmentTransactionInput,
} from '../../common/financial/holdings';
import { CurrencyConverter } from '../../common/financial/currency-converter';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';
import { MarketDataService } from '../market-data/market-data.service';
import {
  createAccountNotFoundForPortfolioException,
  createPortfolioNotFoundException,
} from './portfolios.errors';
import type {
  PortfolioAccountItem,
  PortfolioAllocationItem,
  PortfolioMetrics,
  PortfolioResponse,
} from './portfolios.types';
import type { CreatePortfolioDto } from './dto/create-portfolio.dto';
import type { UpdatePortfolioDto } from './dto/update-portfolio.dto';
import { InvestmentsService } from '../investments/investments.service';

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

interface InvestmentDetailRecord {
  readonly assetId: string;
  readonly tradeType: string;
  readonly quantity: Decimal;
  readonly price: Decimal;
  readonly fees: Decimal;
  readonly asset: {
    readonly id: string;
    readonly name: string;
    readonly currentPrice: Decimal | null;
    readonly priceCurrency: string | null;
    readonly provider: 'FINNHUB' | 'COINGECKO' | 'EODHD' | null;
    readonly providerAssetId: string | null;
    readonly category: {
      readonly name: string;
    };
    readonly riskProfile: {
      readonly name: string;
      readonly score: number;
    } | null;
  };
  readonly transaction: {
    readonly currency: string;
    readonly occurredAt: Date;
  };
}

interface PortfolioHolding {
  readonly currentValue: Decimal | null;
  readonly costBasis: Decimal;
  readonly unrealizedGain: Decimal | null;
  readonly realizedGain: Decimal;
  readonly categoryName: string;
  readonly riskScore: number | null;
}

@Injectable()
export class PortfoliosService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly marketData?: MarketDataService,
    @Optional() private readonly investments?: InvestmentsService,
  ) {}

  async listPortfoliosForUser(
    user: AuthenticatedUser,
  ): Promise<readonly PortfolioResponse[]> {
    const portfolios = await this.prisma.portfolio.findMany({
      where: {
        userId: user.id,
      },
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true,
        name: true,
        description: true,
        accounts: {
          select: {
            accountId: true,
          },
        },
        holdings: { select: { accountId: true, assetId: true } },
        cashAllocations: { select: { accountId: true, percentage: true } },
        createdAt: true,
        updatedAt: true,
      },
    });

    return Promise.all(
      portfolios.map((portfolio) =>
        this.buildPortfolioResponse(user, portfolio),
      ),
    );
  }

  async getPortfolioForUser(
    user: AuthenticatedUser,
    portfolioId: string,
  ): Promise<PortfolioResponse> {
    const portfolio = await this.findOwnedPortfolioOrThrow(
      user.id,
      portfolioId,
    );

    return this.buildPortfolioResponse(user, portfolio);
  }

  async createPortfolioForUser(
    user: AuthenticatedUser,
    payload: CreatePortfolioDto,
  ): Promise<PortfolioResponse> {
    await this.assertAccountsOwnedByUser(user.id, payload.accountIds ?? []);
    await this.assertPositionInputs(user.id, payload.holdings ?? []);
    await this.assertCashAllocations(user.id, payload.cashAllocations ?? []);

    const portfolio = await this.prisma.portfolio.create({
      data: {
        userId: user.id,
        name: payload.name,
        description: payload.description,
        accounts: {
          create: (payload.accountIds ?? []).map((accountId) => ({
            account: {
              connect: {
                id: accountId,
              },
            },
          })),
        },
        holdings: {
          create: (payload.holdings ?? []).map(({ accountId, assetId }) => ({
            account: { connect: { id: accountId } },
            asset: { connect: { id: assetId } },
          })),
        },
        cashAllocations: {
          create: (payload.cashAllocations ?? []).map(
            ({ accountId, percentage }) => ({
              account: { connect: { id: accountId } },
              percentage,
            }),
          ),
        },
      },
      select: {
        id: true,
        name: true,
        description: true,
        accounts: {
          select: {
            accountId: true,
          },
        },
        holdings: { select: { accountId: true, assetId: true } },
        cashAllocations: { select: { accountId: true, percentage: true } },
        createdAt: true,
        updatedAt: true,
      },
    });

    return this.buildPortfolioResponse(user, portfolio);
  }

  async updatePortfolioForUser(
    user: AuthenticatedUser,
    portfolioId: string,
    payload: UpdatePortfolioDto,
  ): Promise<PortfolioResponse> {
    await this.findOwnedPortfolioOrThrow(user.id, portfolioId);

    if (payload.accountIds !== undefined) {
      await this.assertAccountsOwnedByUser(user.id, payload.accountIds);
    }
    if (payload.holdings !== undefined) {
      await this.assertPositionInputs(user.id, payload.holdings, portfolioId);
    }
    if (payload.cashAllocations !== undefined) {
      await this.assertCashAllocations(
        user.id,
        payload.cashAllocations,
        portfolioId,
      );
    }

    const portfolio = await this.prisma.portfolio.update({
      where: {
        id: portfolioId,
      },
      data: {
        name: payload.name,
        description: payload.description,
        accounts:
          payload.accountIds !== undefined
            ? {
                deleteMany: {},
                create: payload.accountIds.map((accountId) => ({
                  account: {
                    connect: {
                      id: accountId,
                    },
                  },
                })),
              }
            : undefined,
        holdings:
          payload.holdings !== undefined
            ? {
                deleteMany: {},
                create: payload.holdings.map(({ accountId, assetId }) => ({
                  account: { connect: { id: accountId } },
                  asset: { connect: { id: assetId } },
                })),
              }
            : undefined,
        cashAllocations:
          payload.cashAllocations !== undefined
            ? {
                deleteMany: {},
                create: payload.cashAllocations.map(
                  ({ accountId, percentage }) => ({
                    account: { connect: { id: accountId } },
                    percentage,
                  }),
                ),
              }
            : undefined,
      },
      select: {
        id: true,
        name: true,
        description: true,
        accounts: {
          select: {
            accountId: true,
          },
        },
        holdings: { select: { accountId: true, assetId: true } },
        cashAllocations: { select: { accountId: true, percentage: true } },
        createdAt: true,
        updatedAt: true,
      },
    });

    return this.buildPortfolioResponse(user, portfolio);
  }

  async deletePortfolioForUser(
    user: AuthenticatedUser,
    portfolioId: string,
  ): Promise<void> {
    await this.findOwnedPortfolioOrThrow(user.id, portfolioId);

    await this.prisma.portfolio.delete({
      where: {
        id: portfolioId,
      },
    });
  }

  private async findOwnedPortfolioOrThrow(
    userId: string,
    portfolioId: string,
  ): Promise<{
    readonly id: string;
    readonly name: string;
    readonly description: string | null;
    readonly accounts: ReadonlyArray<{
      readonly accountId: string;
    }>;
    readonly holdings?: ReadonlyArray<{
      readonly accountId: string;
      readonly assetId: string;
    }>;
    readonly cashAllocations?: ReadonlyArray<{
      readonly accountId: string;
      readonly percentage: Decimal;
    }>;
    readonly createdAt: Date;
    readonly updatedAt: Date;
  }> {
    const portfolio = await this.prisma.portfolio.findFirst({
      where: {
        id: portfolioId,
        userId,
      },
      select: {
        id: true,
        name: true,
        description: true,
        accounts: {
          select: {
            accountId: true,
          },
        },
        holdings: { select: { accountId: true, assetId: true } },
        cashAllocations: { select: { accountId: true, percentage: true } },
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!portfolio) {
      throw createPortfolioNotFoundException(portfolioId);
    }

    return portfolio;
  }

  private async assertAccountsOwnedByUser(
    userId: string,
    accountIds: readonly string[],
  ): Promise<void> {
    if (accountIds.length === 0) {
      return;
    }

    const accounts = await this.prisma.account.findMany({
      where: {
        id: {
          in: [...accountIds],
        },
        userId,
      },
      select: {
        id: true,
      },
    });

    const foundIds = new Set(accounts.map((account) => account.id));

    for (const accountId of accountIds) {
      if (!foundIds.has(accountId)) {
        throw createAccountNotFoundForPortfolioException(accountId);
      }
    }
  }

  private async assertPositionInputs(
    userId: string,
    holdings: readonly {
      readonly accountId: string;
      readonly assetId: string;
    }[],
    portfolioId?: string,
  ): Promise<void> {
    for (const holding of holdings) {
      const [account, asset, history, membership] = await Promise.all([
        this.prisma.account.findFirst({
          where: { id: holding.accountId, userId },
          select: { id: true },
        }),
        this.prisma.asset.findFirst({
          where: { id: holding.assetId, userId },
          select: { id: true },
        }),
        this.prisma.investmentTransactionDetail.findFirst({
          where: {
            assetId: holding.assetId,
            transaction: { accountId: holding.accountId, userId },
          },
          select: { id: true },
        }),
        this.prisma.portfolioHolding.findUnique({
          where: {
            accountId_assetId: {
              accountId: holding.accountId,
              assetId: holding.assetId,
            },
          },
          select: { portfolioId: true },
        }),
      ]);
      if (!account || !asset || !history)
        throw createAccountNotFoundForPortfolioException(holding.accountId);
      if (membership && membership.portfolioId !== portfolioId)
        throw new Error('A position can belong to only one portfolio.');
    }
  }

  private async assertCashAllocations(
    userId: string,
    allocations: readonly {
      readonly accountId: string;
      readonly percentage: string;
    }[],
    portfolioId?: string,
  ): Promise<void> {
    if (!allocations.length) return;
    const accountIds = allocations.map((item) => item.accountId);
    await this.assertAccountsOwnedByUser(userId, accountIds);
    const existing = await this.prisma.portfolioCashAllocation.findMany({
      where: {
        accountId: { in: accountIds },
        portfolioId: portfolioId ? { not: portfolioId } : undefined,
        portfolio: { userId },
      },
      select: { accountId: true, percentage: true },
    });
    for (const allocation of allocations) {
      const percentage = new Decimal(allocation.percentage);
      const used = existing
        .filter((item) => item.accountId === allocation.accountId)
        .reduce((sum, item) => sum.add(item.percentage), new Decimal(0));
      if (
        percentage.isNegative() ||
        percentage.greaterThan(100) ||
        used.add(percentage).greaterThan(100)
      )
        throw new Error(
          'Portfolio cash allocations for an account cannot exceed 100%.',
        );
    }
  }

  private async buildPortfolioResponse(
    user: AuthenticatedUser,
    portfolio: {
      readonly id: string;
      readonly name: string;
      readonly description: string | null;
      readonly accounts: ReadonlyArray<{
        readonly accountId: string;
      }>;
      readonly holdings?: ReadonlyArray<{
        readonly accountId: string;
        readonly assetId: string;
      }>;
      readonly cashAllocations?: ReadonlyArray<{
        readonly accountId: string;
        readonly percentage: Decimal;
      }>;
      readonly createdAt: Date;
      readonly updatedAt: Date;
    },
  ): Promise<PortfolioResponse> {
    if (portfolio.holdings !== undefined && this.investments) {
      return this.buildPositionPortfolioResponse(user, portfolio);
    }
    const accountIds = portfolio.accounts.map((item) => item.accountId);

    const [accounts, metrics, allocation] = await Promise.all([
      this.fetchPortfolioAccounts(user, accountIds),
      this.calculatePortfolioMetrics(user, accountIds),
      this.calculatePortfolioAllocation(user, accountIds),
    ]);

    return {
      id: portfolio.id,
      name: portfolio.name,
      description: portfolio.description,
      accountCount: accounts.length,
      accounts,
      holdings: portfolio.holdings ?? [],
      cashAllocations: (portfolio.cashAllocations ?? []).map((item) => ({
        accountId: item.accountId,
        percentage: item.percentage.toString(),
      })),
      metrics,
      allocation,
      createdAt: portfolio.createdAt.toISOString(),
      updatedAt: portfolio.updatedAt.toISOString(),
    };
  }

  private async buildPositionPortfolioResponse(
    user: AuthenticatedUser,
    portfolio: {
      readonly id: string;
      readonly name: string;
      readonly description: string | null;
      readonly holdings?: ReadonlyArray<{
        readonly accountId: string;
        readonly assetId: string;
      }>;
      readonly cashAllocations?: ReadonlyArray<{
        readonly accountId: string;
        readonly percentage: Decimal;
      }>;
      readonly createdAt: Date;
      readonly updatedAt: Date;
    },
  ): Promise<PortfolioResponse> {
    const { holdings } = await this.investments!.getHoldingsForUser(user, {
      portfolioId: portfolio.id,
      reportingCurrency: user.baseCurrency === 'PKR' ? 'PKR' : 'USD',
    });
    const allocations = portfolio.cashAllocations ?? [];
    const accountIds = [
      ...new Set([
        ...(portfolio.holdings ?? []).map((item) => item.accountId),
        ...allocations.map((item) => item.accountId),
      ]),
    ];
    const [accounts, riskProfiles] = await Promise.all([
      this.fetchPortfolioAccounts(user, accountIds),
      this.prisma.asset.findMany({
        where: {
          userId: user.id,
          id: { in: [...new Set(holdings.map((holding) => holding.assetId))] },
        },
        select: { id: true, riskProfile: { select: { score: true } } },
      }),
    ]);
    const converter = new CurrencyConverter(
      user.baseCurrency,
      user.exchangeRate,
    );
    const allocatedCash = await this.calculateAllocatedCash(
      user.id,
      allocations,
      converter,
    );
    const sum = (
      field: 'currentValue' | 'costBasis' | 'unrealizedGain' | 'realizedGain',
    ) =>
      holdings.reduce(
        (total, holding) =>
          holding[field] ? total.add(holding[field]) : total,
        new Decimal(0),
      );
    const currentValue = sum('currentValue');
    const totalValue = currentValue.add(allocatedCash);
    const riskByAsset = new Map(
      riskProfiles.map((asset) => [asset.id, asset.riskProfile?.score ?? null]),
    );
    let riskWeightedValue = allocatedCash;
    let riskDenominator = allocatedCash;
    const categories = new Map<string, Decimal>();
    for (const holding of holdings) {
      if (!holding.currentValue || holding.positionStatus === 'CLOSED')
        continue;
      const category =
        holding.liquidityClass === 'CASH_EQUIVALENT'
          ? 'Cash equivalents'
          : holding.categoryName;
      categories.set(
        category,
        (categories.get(category) ?? new Decimal(0)).add(holding.currentValue),
      );
      const score = riskByAsset.get(holding.assetId);
      if (score !== null && score !== undefined) {
        riskWeightedValue = riskWeightedValue.add(
          new Decimal(holding.currentValue).times(score),
        );
        riskDenominator = riskDenominator.add(holding.currentValue);
      }
    }
    if (!allocatedCash.isZero()) categories.set('Fiat cash', allocatedCash);

    return {
      id: portfolio.id,
      name: portfolio.name,
      description: portfolio.description,
      accountCount: accounts.length,
      accounts,
      holdings: portfolio.holdings ?? [],
      cashAllocations: allocations.map((item) => ({
        accountId: item.accountId,
        percentage: item.percentage.toString(),
      })),
      metrics: {
        totalValue: totalValue.toFixed(2),
        totalCostBasis: sum('costBasis').toFixed(2),
        totalUnrealizedGain: sum('unrealizedGain').toFixed(2),
        totalRealizedGain: sum('realizedGain').toFixed(2),
        weightedRiskScore: riskDenominator.isZero()
          ? null
          : riskWeightedValue
              .dividedBy(riskDenominator)
              .toDecimalPlaces(1)
              .toNumber(),
        baseCurrency: converter.baseCurrency,
        isPartial: holdings.some((holding) => holding.currentValue === null),
        unpricedAssetCount: holdings.filter(
          (holding) => holding.currentValue === null,
        ).length,
      },
      allocation: [...categories.entries()].map(([category, value]) => ({
        category,
        value: totalValue.isZero()
          ? 0
          : value
              .dividedBy(totalValue)
              .times(100)
              .toDecimalPlaces(1)
              .toNumber(),
      })),
      createdAt: portfolio.createdAt.toISOString(),
      updatedAt: portfolio.updatedAt.toISOString(),
    };
  }

  private async calculateAllocatedCash(
    userId: string,
    allocations: readonly {
      readonly accountId: string;
      readonly percentage: Decimal;
    }[],
    converter: CurrencyConverter,
  ): Promise<Decimal> {
    if (!allocations.length) return new Decimal(0);
    const accountIds = allocations.map((item) => item.accountId);
    const [accounts, transactions] = await Promise.all([
      this.prisma.account.findMany({
        where: { userId, id: { in: accountIds } },
        select: { id: true, currency: true, openingBalance: true },
      }),
      this.prisma.transaction.findMany({
        where: {
          userId,
          status: 'CLEARED',
          deletedAt: null,
          OR: [
            { accountId: { in: accountIds } },
            { destinationAccountId: { in: accountIds } },
          ],
        },
        select: {
          type: true,
          accountId: true,
          destinationAccountId: true,
          amount: true,
        },
      }),
    ]);
    const percentages = new Map(
      allocations.map((item) => [item.accountId, item.percentage]),
    );
    return accounts.reduce((total, account) => {
      const balance = calculateAccountBalance(
        account.openingBalance,
        account.id,
        transactions,
      );
      return total.add(
        converter
          .convert(balance, account.currency)
          .times(percentages.get(account.id) ?? 0)
          .dividedBy(100),
      );
    }, new Decimal(0));
  }

  private async fetchPortfolioAccounts(
    user: AuthenticatedUser,
    accountIds: readonly string[],
  ): Promise<readonly PortfolioAccountItem[]> {
    if (accountIds.length === 0) {
      return [];
    }

    const accounts = await this.prisma.account.findMany({
      where: {
        id: {
          in: [...accountIds],
        },
        userId: user.id,
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

    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId: user.id,
        status: 'CLEARED',
        deletedAt: null,
        OR: [
          {
            accountId: {
              in: [...accountIds],
            },
          },
          {
            destinationAccountId: {
              in: [...accountIds],
            },
          },
        ],
      },
      select: {
        type: true,
        accountId: true,
        destinationAccountId: true,
        amount: true,
      },
    });

    const converter = new CurrencyConverter(
      user.baseCurrency,
      user.exchangeRate,
    );

    return accounts.map((account) => {
      const currentBalance = calculateAccountBalance(
        account.openingBalance,
        account.id,
        transactions,
      );

      return {
        id: account.id,
        name: account.name,
        type: account.type,
        currency: converter.baseCurrency,
        currentBalance: converter
          .convert(currentBalance, account.currency)
          .toFixed(2),
      };
    });
  }

  private async calculatePortfolioMetrics(
    user: AuthenticatedUser,
    accountIds: readonly string[],
  ): Promise<PortfolioMetrics> {
    const converter = new CurrencyConverter(
      user.baseCurrency,
      user.exchangeRate,
    );

    const cashTotal = await this.calculateCashTotal(
      user.id,
      accountIds,
      converter,
    );
    const holdings = await this.calculatePortfolioHoldings(
      user.id,
      accountIds,
      converter,
    );

    const totalHoldingsValue = holdings.reduce(
      (sum, holding) =>
        holding.currentValue ? sum.add(holding.currentValue) : sum,
      new Decimal(0),
    );
    const totalCostBasis = holdings.reduce(
      (sum, holding) => sum.add(holding.costBasis),
      new Decimal(0),
    );
    const totalUnrealizedGain = holdings.reduce(
      (sum, holding) =>
        holding.unrealizedGain ? sum.add(holding.unrealizedGain) : sum,
      new Decimal(0),
    );
    const totalRealizedGain = holdings.reduce(
      (sum, holding) => sum.add(holding.realizedGain),
      new Decimal(0),
    );

    let riskWeightedSum = new Decimal(0);
    let riskWeightedDenominator = new Decimal(0);

    for (const holding of holdings) {
      if (holding.riskScore !== null && holding.currentValue) {
        riskWeightedSum = riskWeightedSum.add(
          holding.currentValue.times(holding.riskScore),
        );
        riskWeightedDenominator = riskWeightedDenominator.add(
          holding.currentValue,
        );
      }
    }

    const weightedRiskScore = riskWeightedDenominator.isZero()
      ? null
      : riskWeightedSum
          .dividedBy(riskWeightedDenominator)
          .toDecimalPlaces(2)
          .toNumber();

    return {
      totalValue: cashTotal.add(totalHoldingsValue).toFixed(2),
      totalCostBasis: totalCostBasis.toFixed(2),
      totalUnrealizedGain: totalUnrealizedGain.toFixed(2),
      totalRealizedGain: totalRealizedGain.toFixed(2),
      weightedRiskScore,
      baseCurrency: converter.baseCurrency,
      isPartial: holdings.some((holding) => holding.currentValue === null),
      unpricedAssetCount: holdings.filter(
        (holding) => holding.currentValue === null,
      ).length,
    };
  }

  private async calculateCashTotal(
    userId: string,
    accountIds: readonly string[],
    converter: CurrencyConverter,
  ): Promise<Decimal> {
    if (accountIds.length === 0) {
      return new Decimal(0);
    }

    const accounts = await this.prisma.account.findMany({
      where: {
        id: {
          in: [...accountIds],
        },
        userId,
      },
      select: {
        id: true,
        currency: true,
        openingBalance: true,
      },
    });

    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId,
        status: 'CLEARED',
        deletedAt: null,
        OR: [
          {
            accountId: {
              in: [...accountIds],
            },
          },
          {
            destinationAccountId: {
              in: [...accountIds],
            },
          },
        ],
      },
      select: {
        type: true,
        accountId: true,
        destinationAccountId: true,
        amount: true,
      },
    });

    return accounts.reduce((sum, account) => {
      const balance = calculateAccountBalance(
        account.openingBalance,
        account.id,
        transactions,
      );

      return sum.add(converter.convert(balance, account.currency));
    }, new Decimal(0));
  }

  private async calculatePortfolioHoldings(
    userId: string,
    accountIds: readonly string[],
    converter: CurrencyConverter,
  ): Promise<readonly PortfolioHolding[]> {
    if (accountIds.length === 0) {
      return [];
    }

    const details = await this.fetchInvestmentDetails(userId, accountIds);
    const detailsByAsset = this.groupDetailsByAsset(details);
    const assetSources = [
      ...new Map(
        details.map((detail) => [detail.asset.id, detail.asset]),
      ).values(),
    ];
    const prices = this.marketData
      ? await this.marketData.getPricesForSources(assetSources)
      : [];
    const pricesByAsset = new Map(
      prices.map((price) => [price.assetId, price]),
    );
    const holdings: PortfolioHolding[] = [];

    for (const [assetId, assetDetails] of detailsByAsset.entries()) {
      const firstDetail = assetDetails[0];
      const currency = this.resolveHoldingCurrency(
        firstDetail.asset,
        assetDetails,
      );
      const price = pricesByAsset.get(assetId);
      const calculation = calculateHolding({
        currentPrice: price?.price
          ? new Decimal(price.price)
          : firstDetail.asset.currentPrice,
        priceCurrency: currency,
        transactions: assetDetails.map((detail) => ({
          type: detail.tradeType as InvestmentTransactionInput['type'],
          quantity: detail.quantity,
          price: detail.price,
          fees: detail.fees,
        })),
      });

      holdings.push({
        currentValue: calculation.currentValue
          ? converter.convert(calculation.currentValue, currency)
          : null,
        costBasis: converter.convert(calculation.costBasis, currency),
        unrealizedGain: calculation.unrealizedGain
          ? converter.convert(calculation.unrealizedGain, currency)
          : null,
        realizedGain: converter.convert(calculation.realizedGain, currency),
        categoryName: firstDetail.asset.category.name,
        riskScore: firstDetail.asset.riskProfile?.score ?? null,
      });
    }

    return holdings;
  }

  private async calculatePortfolioAllocation(
    user: AuthenticatedUser,
    accountIds: readonly string[],
  ): Promise<readonly PortfolioAllocationItem[]> {
    const converter = new CurrencyConverter(
      user.baseCurrency,
      user.exchangeRate,
    );
    const holdings = await this.calculatePortfolioHoldings(
      user.id,
      accountIds,
      converter,
    );

    const totalValue = holdings.reduce(
      (sum, holding) =>
        holding.currentValue ? sum.add(holding.currentValue) : sum,
      new Decimal(0),
    );

    if (totalValue.isZero()) {
      return [];
    }

    const categoryValues = new Map<string, Decimal>();

    for (const holding of holdings) {
      if (!holding.currentValue) {
        continue;
      }
      const current =
        categoryValues.get(holding.categoryName) ?? new Decimal(0);
      categoryValues.set(
        holding.categoryName,
        current.add(holding.currentValue),
      );
    }

    return Array.from(categoryValues.entries()).map(([category, value]) => ({
      category,
      value: value
        .dividedBy(totalValue)
        .times(100)
        .toDecimalPlaces(1)
        .toNumber(),
    }));
  }

  private async fetchInvestmentDetails(
    userId: string,
    accountIds: readonly string[],
  ): Promise<readonly InvestmentDetailRecord[]> {
    return this.prisma.investmentTransactionDetail.findMany({
      where: {
        asset: {
          userId,
        },
        transaction: {
          status: 'CLEARED',
          deletedAt: null,
          reversalOfId: null,
          reversal: { is: null },
          accountId: {
            in: [...accountIds],
          },
        },
      },
      select: {
        assetId: true,
        tradeType: true,
        quantity: true,
        price: true,
        fees: true,
        asset: {
          select: {
            id: true,
            name: true,
            currentPrice: true,
            priceCurrency: true,
            provider: true,
            providerAssetId: true,
            category: {
              select: {
                name: true,
              },
            },
            riskProfile: {
              select: {
                name: true,
                score: true,
              },
            },
          },
        },
        transaction: {
          select: {
            currency: true,
            occurredAt: true,
          },
        },
      },
      orderBy: {
        transaction: {
          occurredAt: 'asc',
        },
      },
    });
  }

  private groupDetailsByAsset(
    details: readonly InvestmentDetailRecord[],
  ): ReadonlyMap<string, InvestmentDetailRecord[]> {
    const groups = new Map<string, InvestmentDetailRecord[]>();

    for (const detail of details) {
      const current = groups.get(detail.assetId) ?? [];
      groups.set(detail.assetId, [...current, detail]);
    }

    return groups;
  }

  private resolveHoldingCurrency(
    asset: {
      readonly priceCurrency: string | null;
    },
    details: ReadonlyArray<{
      readonly transaction: { readonly currency: string };
    }>,
  ): string {
    if (asset.priceCurrency) {
      return asset.priceCurrency;
    }

    const firstDetail = details[0];

    return firstDetail?.transaction.currency ?? 'USD';
  }
}
