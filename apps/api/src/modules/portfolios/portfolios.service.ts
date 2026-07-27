import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { calculateAccountBalance } from '../../common/financial/transaction-effects';
import {
  calculateHolding,
  type InvestmentTransactionInput,
} from '../../common/financial/holdings';
import { CurrencyConverter } from '../../common/financial/currency-converter';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';
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

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

interface AccountRecord {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly currency: string;
  readonly openingBalance: Decimal;
}

interface InvestmentDetailRecord {
  readonly assetId: string;
  readonly tradeType: string;
  readonly quantity: Decimal;
  readonly price: Decimal;
  readonly fees: Decimal;
  readonly asset: {
    readonly name: string;
    readonly currentPrice: Decimal | null;
    readonly priceCurrency: string | null;
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
  readonly currentValue: Decimal;
  readonly costBasis: Decimal;
  readonly unrealizedGain: Decimal;
  readonly realizedGain: Decimal;
  readonly categoryName: string;
  readonly riskScore: number | null;
}

@Injectable()
export class PortfoliosService {
  constructor(private readonly prisma: PrismaService) {}

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
        createdAt: true,
        updatedAt: true,
      },
    });

    return Promise.all(
      portfolios.map((portfolio) => this.buildPortfolioResponse(user, portfolio)),
    );
  }

  async getPortfolioForUser(
    user: AuthenticatedUser,
    portfolioId: string,
  ): Promise<PortfolioResponse> {
    const portfolio = await this.findOwnedPortfolioOrThrow(user.id, portfolioId);

    return this.buildPortfolioResponse(user, portfolio);
  }

  async createPortfolioForUser(
    user: AuthenticatedUser,
    payload: CreatePortfolioDto,
  ): Promise<PortfolioResponse> {
    await this.assertAccountsOwnedByUser(user.id, payload.accountIds);

    const portfolio = await this.prisma.portfolio.create({
      data: {
        userId: user.id,
        name: payload.name,
        description: payload.description,
        accounts: {
          create: payload.accountIds.map((accountId) => ({
            account: {
              connect: {
                id: accountId,
              },
            },
          })),
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
    const existingPortfolio = await this.findOwnedPortfolioOrThrow(
      user.id,
      portfolioId,
    );

    if (payload.accountIds !== undefined) {
      await this.assertAccountsOwnedByUser(user.id, payload.accountIds);
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

  private async buildPortfolioResponse(
    user: AuthenticatedUser,
    portfolio: {
      readonly id: string;
      readonly name: string;
      readonly description: string | null;
      readonly accounts: ReadonlyArray<{
        readonly accountId: string;
      }>;
      readonly createdAt: Date;
      readonly updatedAt: Date;
    },
  ): Promise<PortfolioResponse> {
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
      metrics,
      allocation,
      createdAt: portfolio.createdAt.toISOString(),
      updatedAt: portfolio.updatedAt.toISOString(),
    };
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
      (sum, holding) => sum.add(holding.currentValue),
      new Decimal(0),
    );
    const totalCostBasis = holdings.reduce(
      (sum, holding) => sum.add(holding.costBasis),
      new Decimal(0),
    );
    const totalUnrealizedGain = holdings.reduce(
      (sum, holding) => sum.add(holding.unrealizedGain),
      new Decimal(0),
    );
    const totalRealizedGain = holdings.reduce(
      (sum, holding) => sum.add(holding.realizedGain),
      new Decimal(0),
    );

    let riskWeightedSum = new Decimal(0);
    let riskWeightedDenominator = new Decimal(0);

    for (const holding of holdings) {
      if (holding.riskScore !== null) {
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
    const holdings: PortfolioHolding[] = [];

    for (const [assetId, assetDetails] of detailsByAsset.entries()) {
      const firstDetail = assetDetails[0];
      const currency = this.resolveHoldingCurrency(firstDetail.asset, assetDetails);
      const calculation = calculateHolding({
        currentPrice: firstDetail.asset.currentPrice,
        priceCurrency: currency,
        transactions: assetDetails.map((detail) => ({
          type: detail.tradeType as InvestmentTransactionInput['type'],
          quantity: detail.quantity,
          price: detail.price,
          fees: detail.fees,
        })),
      });

      holdings.push({
        currentValue: converter.convert(calculation.currentValue, currency),
        costBasis: converter.convert(calculation.costBasis, currency),
        unrealizedGain: converter.convert(
          calculation.unrealizedGain,
          currency,
        ),
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
      (sum, holding) => sum.add(holding.currentValue),
      new Decimal(0),
    );

    if (totalValue.isZero()) {
      return [];
    }

    const categoryValues = new Map<string, Decimal>();

    for (const holding of holdings) {
      const current = categoryValues.get(holding.categoryName) ?? new Decimal(0);
      categoryValues.set(
        holding.categoryName,
        current.add(holding.currentValue),
      );
    }

    return Array.from(categoryValues.entries()).map(([category, value]) => ({
      category,
      value: value.dividedBy(totalValue).times(100).toDecimalPlaces(1).toNumber(),
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
            name: true,
            currentPrice: true,
            priceCurrency: true,
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
