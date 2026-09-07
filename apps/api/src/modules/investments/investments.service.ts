import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { convertUsdPkr } from '../../common/financial/fx-conversion';
import {
  calculateHolding,
  type InvestmentTransactionInput,
} from '../../common/financial/holdings';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { Prisma } from '../../generated/prisma/client';
import type { TransactionType } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { MarketDataService } from '../market-data/market-data.service';
import type { MarketSearchResult } from '../market-data/market-data.types';
import type { AssetPrice } from '../market-data/market-data.types';
import type {
  CurrencyTotal,
  HoldingGroupBy,
  HoldingResponse,
  InvestmentSummaryResponse,
  ReportingCurrency,
  PositionCommandResponse,
} from './investments.types';
import type { CreatePositionDto } from './dto/create-position.dto';
import { isAutomaticCashEquivalent } from '../assets/asset-liquidity';
import { calculateAccountBalance } from '../../common/financial/transaction-effects';
import { holdingTransactionsForAsset } from '../../common/financial/settlement-holdings';
import type { SettlementAssetDto } from './dto/settlement-asset.dto';
import {
  insufficientAccountCashException,
  insufficientSettlementBalanceException,
  invalidSettlementAssetException,
  settlementAssetNotFoundException,
  settlementAssetRequiredException,
} from './investment-settlement.errors';

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

interface AssetRecord {
  readonly id: string;
  readonly name: string;
  readonly symbol: string | null;
  readonly currentPrice: Decimal | null;
  readonly priceCurrency: string | null;
  readonly provider: 'FINNHUB' | 'COINGECKO' | 'EODHD' | null;
  readonly providerAssetId: string | null;
  readonly liquidityClass: 'INVESTMENT' | 'CASH_EQUIVALENT';
  readonly liquidityClassSource: 'AUTO' | 'USER';
  readonly category: { readonly name: string };
  readonly riskProfile: { readonly name: string } | null;
}

interface DetailRecord {
  readonly id: string;
  readonly assetId: string;
  readonly settlementAssetId: string | null;
  readonly tradeType: string;
  readonly quantity: Decimal;
  readonly price: Decimal;
  readonly priceCurrency: string;
  readonly fees: Decimal;
  readonly grossAmount: Decimal;
  readonly fxRateUsdToPkr: Decimal | null;
  readonly transferDirection?: 'IN' | 'OUT';
  readonly transaction: {
    readonly currency: string;
    readonly occurredAt: Date;
    readonly account: {
      readonly id: string;
      readonly name: string;
      readonly currency: string;
      readonly portfolioHoldings: ReadonlyArray<{
        readonly assetId: string;
        readonly portfolio: {
          readonly id: string;
          readonly name: string;
        };
      }>;
    };
    readonly destinationAccount: {
      readonly id: string;
      readonly name: string;
      readonly currency: string;
      readonly portfolioHoldings: ReadonlyArray<{
        readonly assetId: string;
        readonly portfolio: {
          readonly id: string;
          readonly name: string;
        };
      }>;
    } | null;
  };
}

interface InvestmentAccountRecord {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
  readonly openingBalance: Decimal;
  readonly transactions: ReadonlyArray<{
    readonly type: TransactionType;
    readonly accountId: string;
    readonly destinationAccountId: string | null;
    readonly amount: Decimal;
  }>;
  readonly transfersIn: ReadonlyArray<{
    readonly type: TransactionType;
    readonly accountId: string;
    readonly destinationAccountId: string | null;
    readonly amount: Decimal;
  }>;
  readonly portfolioCashAllocations: ReadonlyArray<{
    readonly percentage: Decimal;
    readonly portfolio: { readonly id: string; readonly name: string };
  }>;
}

interface ReportOptions {
  readonly reportingCurrency?: ReportingCurrency;
  readonly accountId?: string;
  readonly portfolioId?: string;
  readonly assetType?: string;
  readonly currency?: string;
  readonly groupBy?: HoldingGroupBy;
  readonly includeZeroCash?: boolean;
}

@Injectable()
export class InvestmentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly marketData?: MarketDataService,
  ) {}

  async getAccountSummaryForUser(user: AuthenticatedUser, accountId: string) {
    const account = await this.prisma.account.findFirst({
      where: {
        id: accountId,
        userId: user.id,
        type: { in: ['BROKER', 'CRYPTO_WALLET'] },
      },
      select: {
        id: true,
        name: true,
        currency: true,
        openingBalance: true,
        transactions: {
          where: { status: 'CLEARED', deletedAt: null },
          select: {
            type: true,
            accountId: true,
            destinationAccountId: true,
            amount: true,
          },
        },
        transfersIn: {
          where: { status: 'CLEARED', deletedAt: null },
          select: {
            type: true,
            accountId: true,
            destinationAccountId: true,
            amount: true,
          },
        },
      },
    });
    if (!account) throw new NotFoundException('Investment account not found.');
    const cash = calculateAccountBalance(account.openingBalance, account.id, [
      ...account.transactions,
      ...account.transfersIn,
    ]);
    const reportingCurrency = this.toReportingCurrency(user.baseCurrency);
    const { holdings } = await this.getHoldingsForUser(user, {
      accountId,
      reportingCurrency,
      includeZeroCash: true,
    });
    const sum = (
      items: readonly HoldingResponse[],
      field: 'currentValue' | 'costBasis' | 'realizedGain' | 'unrealizedGain',
    ) =>
      items.reduce(
        (total, item) => (item[field] ? total.add(item[field]) : total),
        new Decimal(0),
      );
    const cashReporting = convertUsdPkr(
      cash,
      account.currency,
      reportingCurrency,
      user.exchangeRate ? new Decimal(user.exchangeRate) : null,
    );
    const cashEquivalents = holdings.filter(
      (holding) =>
        holding.holdingKind === 'ASSET' &&
        holding.positionStatus === 'ACTIVE' &&
        holding.liquidityClass === 'CASH_EQUIVALENT',
    );
    const investments = holdings.filter(
      (holding) =>
        holding.holdingKind === 'ASSET' &&
        holding.positionStatus === 'ACTIVE' &&
        holding.liquidityClass === 'INVESTMENT',
    );
    const cashEquivalentValue = sum(cashEquivalents, 'currentValue');
    const investedValue = sum(investments, 'currentValue');
    return {
      accountId: account.id,
      accountName: account.name,
      accountCurrency: account.currency,
      reportingCurrency,
      availableFiatCash: cash.toFixed(2),
      cashEquivalentValue: cashEquivalentValue.toFixed(2),
      investedValue: investedValue.toFixed(2),
      totalLiquidity: cashReporting
        ? cashReporting.add(cashEquivalentValue).toFixed(2)
        : null,
      totalAccountValue: cashReporting
        ? cashReporting.add(cashEquivalentValue).add(investedValue).toFixed(2)
        : null,
      costBasis: sum(holdings, 'costBasis').toFixed(2),
      realizedGain: sum(holdings, 'realizedGain').toFixed(2),
      unrealizedGain: sum(holdings, 'unrealizedGain').toFixed(2),
      holdings,
    };
  }

  async createPositionForUser(
    user: AuthenticatedUser,
    payload: CreatePositionDto,
  ): Promise<PositionCommandResponse> {
    const quantity = new Decimal(payload.quantity);
    if (!quantity.isPositive()) {
      throw new BadRequestException('Quantity must be greater than zero.');
    }

    const providerCandidate =
      payload.asset.kind === 'PROVIDER'
        ? await this.resolveProviderCandidate(payload)
        : null;
    const settlementCandidate =
      payload.settlementAsset?.kind === 'PROVIDER'
        ? await this.resolveSettlementCandidate(payload.settlementAsset)
        : null;

    let result: {
      assetId: string;
      accountId: string;
      portfolioId: string | null;
      transactionId: string;
    };
    try {
      result = await this.prisma.$transaction(
        async (tx) => {
          const existing = await tx.transaction.findFirst({
            where: { userId: user.id, idempotencyKey: payload.idempotencyKey },
            select: {
              id: true,
              accountId: true,
              investmentDetail: { select: { assetId: true } },
            },
          });
          if (existing?.investmentDetail) {
            const membership = await tx.portfolioHolding.findUnique({
              where: {
                accountId_assetId: {
                  accountId: existing.accountId,
                  assetId: existing.investmentDetail.assetId,
                },
              },
              select: { portfolioId: true },
            });
            return {
              assetId: existing.investmentDetail.assetId,
              accountId: existing.accountId,
              portfolioId: membership?.portfolioId ?? null,
              transactionId: existing.id,
            };
          }

          const asset = await this.resolvePositionAsset(
            tx,
            user.id,
            payload,
            providerCandidate,
          );
          const account = await this.resolvePositionAccount(
            tx,
            user.id,
            payload,
            asset.marketType,
          );
          const priceCurrency = asset.priceCurrency;
          if (!priceCurrency) {
            throw new BadRequestException('Asset price currency is required.');
          }
          const price = this.resolvePositionPrice(payload, quantity);
          const fees = new Decimal(payload.fees ?? '0');
          if (payload.mode === 'OPENING' && !fees.isZero()) {
            throw new BadRequestException(
              'Opening positions cannot include fees.',
            );
          }
          const settlementAsset =
            account.type === 'CRYPTO_WALLET' && payload.mode === 'BUY'
              ? await this.resolvePositionSettlementAsset(
                  tx,
                  user.id,
                  payload.settlementAsset,
                  settlementCandidate,
                  asset.id,
                )
              : null;
          const fxRate = payload.historicalFxRate
            ? new Decimal(payload.historicalFxRate)
            : user.exchangeRate
              ? new Decimal(user.exchangeRate)
              : null;
          if (
            !settlementAsset &&
            priceCurrency !== account.currency &&
            (!fxRate || !fxRate.isPositive())
          ) {
            throw new BadRequestException(
              'A positive USD-to-PKR rate is required for cross-currency positions.',
            );
          }
          const grossAmount = quantity.times(price).toDecimalPlaces(8);
          const convertedGross = settlementAsset
            ? grossAmount
            : this.convertPositionAmount(
                grossAmount,
                priceCurrency,
                account.currency,
                fxRate,
              );
          const amount =
            payload.mode === 'OPENING'
              ? new Decimal(0)
              : settlementAsset
                ? new Decimal(0)
                : convertedGross.add(fees);

          if (payload.mode === 'BUY') {
            if (settlementAsset) {
              await this.assertSettlementBalance(
                tx,
                user.id,
                account.id,
                settlementAsset.id,
                grossAmount.add(fees),
              );
            } else {
              await this.assertAccountCashBalance(
                tx,
                user.id,
                account.id,
                amount,
              );
            }
          }

          const transaction = await tx.transaction.create({
            data: {
              userId: user.id,
              idempotencyKey: payload.idempotencyKey,
              type:
                payload.mode === 'OPENING'
                  ? 'INVESTMENT_OPENING_POSITION'
                  : 'INVESTMENT_BUY',
              status: 'CLEARED',
              accountId: account.id,
              amount,
              currency: account.currency,
              occurredAt: new Date(payload.occurredAt),
              category:
                payload.mode === 'OPENING' ? 'Opening position' : 'Investment',
              description: `${payload.mode === 'OPENING' ? 'Opening position' : 'Buy'} ${asset.symbol ?? asset.name}`,
              investmentDetail: {
                create: {
                  assetId: asset.id,
                  settlementAssetId: settlementAsset?.id,
                  tradeType: payload.mode === 'OPENING' ? 'OPENING' : 'BUY',
                  quantity,
                  price,
                  priceCurrency,
                  grossAmount,
                  fees,
                  fxRateUsdToPkr: fxRate,
                  fxRateSource: payload.historicalFxRate
                    ? 'USER_POSITION_INPUT'
                    : user.exchangeRate
                      ? user.exchangeRateSource
                      : undefined,
                  fxRateUpdatedAt: payload.historicalFxRate
                    ? new Date(payload.occurredAt)
                    : user.exchangeRateUpdatedAt
                      ? new Date(user.exchangeRateUpdatedAt)
                      : undefined,
                },
              },
            },
            select: { id: true },
          });

          const portfolioId = await this.resolvePositionPortfolio(
            tx,
            user.id,
            payload,
            account.id,
            asset.id,
          );
          return {
            assetId: asset.id,
            accountId: account.id,
            portfolioId,
            transactionId: transaction.id,
          };
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }
      const replay = await this.findPositionCommandResult(
        user.id,
        payload.idempotencyKey,
      );
      if (!replay) throw error;
      result = replay;
    }

    const { holdings } = await this.getHoldingsForUser(user, {
      accountId: result.accountId,
    });
    const holding = holdings.find((item) => item.assetId === result.assetId);
    if (!holding) {
      throw new Error('Created position could not be read back.');
    }
    return { data: { ...result, holding } };
  }

  private async findPositionCommandResult(
    userId: string,
    idempotencyKey: string,
  ) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { userId, idempotencyKey },
      select: {
        id: true,
        accountId: true,
        investmentDetail: { select: { assetId: true } },
      },
    });
    if (!transaction?.investmentDetail) return null;
    const membership = await this.prisma.portfolioHolding.findUnique({
      where: {
        accountId_assetId: {
          accountId: transaction.accountId,
          assetId: transaction.investmentDetail.assetId,
        },
      },
      select: { portfolioId: true },
    });
    return {
      assetId: transaction.investmentDetail.assetId,
      accountId: transaction.accountId,
      portfolioId: membership?.portfolioId ?? null,
      transactionId: transaction.id,
    };
  }

  private async resolveProviderCandidate(payload: CreatePositionDto) {
    if (
      !this.marketData ||
      !payload.asset.type ||
      !payload.asset.provider ||
      !payload.asset.providerAssetId
    ) {
      throw new BadRequestException('Provider asset details are incomplete.');
    }
    return this.marketData.verifyProviderAsset(
      payload.asset.type,
      payload.asset.provider,
      payload.asset.providerAssetId,
    );
  }

  private async resolvePositionAsset(
    tx: Prisma.TransactionClient,
    userId: string,
    payload: CreatePositionDto,
    candidate: Awaited<
      ReturnType<MarketDataService['verifyProviderAsset']>
    > | null,
  ) {
    if (payload.asset.kind === 'EXISTING') {
      if (!payload.asset.assetId)
        throw new BadRequestException('Select an asset.');
      const asset = await tx.asset.findFirst({
        where: { id: payload.asset.assetId, userId },
        select: {
          id: true,
          name: true,
          symbol: true,
          priceCurrency: true,
          marketType: true,
        },
      });
      if (!asset) throw new NotFoundException('Asset not found.');
      if (!asset.priceCurrency)
        throw new BadRequestException('Asset price currency is required.');
      return asset;
    }
    if (payload.asset.kind === 'PROVIDER') {
      if (!candidate)
        throw new BadRequestException('Provider asset could not be resolved.');
      const existing = await tx.asset.findFirst({
        where: {
          userId,
          provider: candidate.provider,
          providerAssetId: candidate.providerAssetId,
        },
        select: {
          id: true,
          name: true,
          symbol: true,
          priceCurrency: true,
          marketType: true,
        },
      });
      if (existing?.priceCurrency) return existing;
      const cashEquivalent = isAutomaticCashEquivalent(
        candidate.provider,
        candidate.providerAssetId,
      );
      const [category, risk] = await Promise.all([
        tx.assetCategory.findUnique({
          where: {
            name: cashEquivalent
              ? 'Cash Equivalent'
              : candidate.type === 'STOCK'
                ? 'Stock'
                : 'Crypto',
          },
          select: { id: true },
        }),
        tx.riskProfile.findUnique({
          where: {
            name: cashEquivalent
              ? 'Cash Equivalents'
              : candidate.type === 'STOCK'
                ? 'Stocks'
                : 'Crypto',
          },
          select: { id: true },
        }),
      ]);
      if (!category)
        throw new BadRequestException('Asset metadata is not seeded.');
      return tx.asset.create({
        data: {
          userId,
          name: candidate.name,
          symbol: candidate.symbol,
          provider: candidate.provider,
          marketType: candidate.type,
          providerAssetId: candidate.providerAssetId,
          exchange: candidate.exchange,
          imageUrl: candidate.imageUrl,
          categoryId: category.id,
          riskProfileId: risk?.id,
          priceCurrency: candidate.quoteCurrency,
          liquidityClass: cashEquivalent ? 'CASH_EQUIVALENT' : 'INVESTMENT',
        },
        select: {
          id: true,
          name: true,
          symbol: true,
          priceCurrency: true,
          marketType: true,
        },
      });
    }
    if (
      !payload.asset.name ||
      !payload.asset.categoryId ||
      !payload.asset.priceCurrency
    ) {
      throw new BadRequestException('Manual asset details are incomplete.');
    }
    return tx.asset.create({
      data: {
        userId,
        name: payload.asset.name,
        symbol: payload.asset.symbol,
        categoryId: payload.asset.categoryId,
        riskProfileId: payload.asset.riskProfileId,
        currentPrice: payload.asset.currentPrice,
        priceCurrency: payload.asset.priceCurrency,
        liquidityClass: payload.asset.liquidityClass,
        liquidityClassSource: payload.asset.liquidityClass ? 'USER' : 'AUTO',
      },
      select: {
        id: true,
        name: true,
        symbol: true,
        priceCurrency: true,
        marketType: true,
      },
    });
  }

  private async resolvePositionAccount(
    tx: Prisma.TransactionClient,
    userId: string,
    payload: CreatePositionDto,
    marketType: string | null,
  ) {
    const expectedType = marketType === 'CRYPTO' ? 'CRYPTO_WALLET' : 'BROKER';
    if (payload.account.kind === 'EXISTING') {
      if (!payload.account.accountId)
        throw new BadRequestException('Select an investment account.');
      const account = await tx.account.findFirst({
        where: {
          id: payload.account.accountId,
          userId,
          type: { in: ['BROKER', 'CRYPTO_WALLET'] },
        },
        select: { id: true, currency: true, type: true },
      });
      if (!account)
        throw new NotFoundException('Investment account not found.');
      if (marketType && account.type !== expectedType)
        throw new BadRequestException(
          'The selected account is not compatible with this asset.',
        );
      return account;
    }
    if (!payload.account.name || !payload.account.currency)
      throw new BadRequestException('New account details are incomplete.');
    return tx.account.create({
      data: {
        userId,
        name: payload.account.name,
        type: expectedType,
        currency: payload.account.currency,
        openingBalance: payload.account.openingBalance ?? '0',
      },
      select: { id: true, currency: true, type: true },
    });
  }

  private async resolveSettlementCandidate(
    input: SettlementAssetDto,
  ): Promise<MarketSearchResult> {
    if (!this.marketData || !input.providerAssetId) {
      throw settlementAssetNotFoundException();
    }
    const candidate = await this.marketData.verifyProviderAsset(
      'CRYPTO',
      'COINGECKO',
      input.providerAssetId,
    );
    if (
      !isAutomaticCashEquivalent(candidate.provider, candidate.providerAssetId)
    ) {
      throw invalidSettlementAssetException(
        'The selected provider asset is not a supported USD cash equivalent.',
      );
    }
    return candidate;
  }

  private async resolvePositionSettlementAsset(
    tx: Prisma.TransactionClient,
    userId: string,
    input: SettlementAssetDto | undefined,
    candidate: MarketSearchResult | null,
    primaryAssetId: string,
  ): Promise<{
    readonly id: string;
    readonly priceCurrency: string | null;
    readonly liquidityClass: string;
  }> {
    if (!input) throw settlementAssetRequiredException();
    const select = {
      id: true,
      priceCurrency: true,
      liquidityClass: true,
    } satisfies Prisma.AssetSelect;
    let asset: {
      id: string;
      priceCurrency: string | null;
      liquidityClass: string;
    } | null;
    if (input.kind === 'EXISTING') {
      if (!input.assetId) throw settlementAssetNotFoundException();
      asset = await tx.asset.findFirst({
        where: { id: input.assetId, userId },
        select,
      });
      if (!asset) throw settlementAssetNotFoundException(input.assetId);
    } else {
      if (!candidate) throw settlementAssetNotFoundException();
      asset = await tx.asset.findFirst({
        where: {
          userId,
          provider: candidate.provider,
          providerAssetId: candidate.providerAssetId,
        },
        select,
      });
      if (!asset) {
        const [category, risk] = await Promise.all([
          tx.assetCategory.findUnique({
            where: { name: 'Cash Equivalent' },
            select: { id: true },
          }),
          tx.riskProfile.findUnique({
            where: { name: 'Cash Equivalents' },
            select: { id: true },
          }),
        ]);
        if (!category) {
          throw invalidSettlementAssetException(
            'Cash-equivalent metadata is not seeded.',
          );
        }
        asset = await tx.asset.create({
          data: {
            userId,
            name: candidate.name,
            symbol: candidate.symbol,
            provider: candidate.provider,
            marketType: 'CRYPTO',
            providerAssetId: candidate.providerAssetId,
            exchange: candidate.exchange,
            imageUrl: candidate.imageUrl,
            categoryId: category.id,
            riskProfileId: risk?.id,
            priceCurrency: 'USD',
            liquidityClass: 'CASH_EQUIVALENT',
          },
          select,
        });
      }
    }
    if (!asset) throw settlementAssetNotFoundException(input.assetId);
    if (asset.id === primaryAssetId) {
      throw invalidSettlementAssetException(
        'An asset cannot settle against itself.',
      );
    }
    if (
      asset.priceCurrency !== 'USD' ||
      asset.liquidityClass !== 'CASH_EQUIVALENT'
    ) {
      throw invalidSettlementAssetException(
        'Settlement assets must be USD-priced cash equivalents.',
      );
    }
    return asset;
  }

  private async assertSettlementBalance(
    tx: Prisma.TransactionClient,
    userId: string,
    accountId: string,
    assetId: string,
    required: Decimal,
  ): Promise<void> {
    const details = await tx.investmentTransactionDetail.findMany({
      where: {
        OR: [{ assetId }, { settlementAssetId: assetId }],
        asset: { userId },
        transaction: {
          accountId,
          status: 'CLEARED',
          deletedAt: null,
          reversalOfId: null,
          reversal: { is: null },
        },
      },
      select: {
        assetId: true,
        settlementAssetId: true,
        tradeType: true,
        quantity: true,
        price: true,
        fees: true,
        grossAmount: true,
      },
    });
    const holding = calculateHolding({
      currentPrice: null,
      priceCurrency: 'USD',
      transactions: holdingTransactionsForAsset(assetId, details),
    });
    if (holding.quantity.lessThan(required)) {
      throw insufficientSettlementBalanceException(
        assetId,
        holding.quantity.toString(),
        required.toString(),
      );
    }
  }

  private async assertAccountCashBalance(
    tx: Prisma.TransactionClient,
    userId: string,
    accountId: string,
    required: Decimal,
  ): Promise<void> {
    const account = await tx.account.findFirst({
      where: { id: accountId, userId },
      select: {
        openingBalance: true,
        transactions: {
          where: { status: 'CLEARED', deletedAt: null },
          select: {
            type: true,
            accountId: true,
            destinationAccountId: true,
            amount: true,
          },
        },
        transfersIn: {
          where: { status: 'CLEARED', deletedAt: null },
          select: {
            type: true,
            accountId: true,
            destinationAccountId: true,
            amount: true,
          },
        },
      },
    });
    if (!account) throw new NotFoundException('Investment account not found.');
    const available = calculateAccountBalance(
      account.openingBalance,
      accountId,
      [...account.transactions, ...account.transfersIn],
    );
    if (available.lessThan(required)) {
      throw insufficientAccountCashException(
        accountId,
        available.toString(),
        required.toString(),
      );
    }
  }

  private resolvePositionPrice(
    payload: CreatePositionDto,
    quantity: Decimal,
  ): Decimal {
    const raw =
      payload.mode === 'BUY'
        ? payload.unitPrice
        : payload.costInput === 'TOTAL'
          ? payload.totalCost
          : payload.unitCost;
    if (!raw)
      throw new BadRequestException(
        'Position cost or purchase price is required.',
      );
    const value = new Decimal(raw);
    const price =
      payload.mode === 'OPENING' && payload.costInput === 'TOTAL'
        ? value.dividedBy(quantity).toDecimalPlaces(8)
        : value;
    if (!price.isPositive())
      throw new BadRequestException('Unit price must be greater than zero.');
    return price;
  }

  private convertPositionAmount(
    amount: Decimal,
    from: string,
    to: string,
    rate: Decimal | null,
  ): Decimal {
    const converted = convertUsdPkr(amount, from, to, rate);
    if (!converted)
      throw new BadRequestException('Unable to convert the position amount.');
    return converted;
  }

  private async resolvePositionPortfolio(
    tx: Prisma.TransactionClient,
    userId: string,
    payload: CreatePositionDto,
    accountId: string,
    assetId: string,
  ): Promise<string | null> {
    if (!payload.portfolio) return null;
    let portfolioId: string;
    if (payload.portfolio.kind === 'EXISTING') {
      if (!payload.portfolio.portfolioId)
        throw new BadRequestException('Select a portfolio.');
      const portfolio = await tx.portfolio.findFirst({
        where: { id: payload.portfolio.portfolioId, userId },
        select: { id: true },
      });
      if (!portfolio) throw new NotFoundException('Portfolio not found.');
      portfolioId = portfolio.id;
    } else {
      if (!payload.portfolio.name)
        throw new BadRequestException('Portfolio name is required.');
      const portfolio = await tx.portfolio.create({
        data: { userId, name: payload.portfolio.name },
        select: { id: true },
      });
      portfolioId = portfolio.id;
    }
    const existing = await tx.portfolioHolding.findUnique({
      where: { accountId_assetId: { accountId, assetId } },
      select: { portfolioId: true },
    });
    if (existing && existing.portfolioId !== portfolioId)
      throw new ConflictException(
        'This position already belongs to another portfolio.',
      );
    await tx.portfolioHolding.upsert({
      where: {
        portfolioId_accountId_assetId: { portfolioId, accountId, assetId },
      },
      create: { portfolioId, accountId, assetId },
      update: {},
    });
    return portfolioId;
  }

  async getHoldingsForUser(
    user: AuthenticatedUser,
    options: ReportOptions = {},
  ): Promise<{
    readonly holdings: readonly HoldingResponse[];
    readonly baseCurrency: string;
    readonly reportingCurrency: ReportingCurrency;
  }> {
    const reportingCurrency =
      options.reportingCurrency ?? this.toReportingCurrency(user.baseCurrency);
    const [assets, details, accounts] = await Promise.all([
      this.fetchAssets(user.id),
      this.fetchInvestmentDetails(user.id),
      this.fetchInvestmentAccounts(user.id),
    ]);
    const filteredAssets = assets.filter(
      (asset) =>
        (!options.assetType ||
          asset.category.name.toLocaleLowerCase() ===
            options.assetType.toLocaleLowerCase()) &&
        (!options.currency || asset.priceCurrency === options.currency),
    );
    const assetIds = new Set(filteredAssets.map((asset) => asset.id));
    const filteredDetails = details.filter(
      (detail) =>
        assetIds.has(detail.assetId) ||
        Boolean(
          detail.settlementAssetId && assetIds.has(detail.settlementAssetId),
        ),
    );
    const detailsByHolding = this.groupDetailsByHolding(filteredDetails);
    const prices = this.marketData
      ? await this.marketData.getPricesForSources(filteredAssets)
      : [];
    const pricesByAsset = new Map(
      prices.map((price) => [price.assetId, price]),
    );
    const assetsById = new Map(
      filteredAssets.map((asset) => [asset.id, asset]),
    );
    const latestRate = user.exchangeRate
      ? new Decimal(user.exchangeRate)
      : null;
    const holdings: HoldingResponse[] = [];

    for (const [holdingKey, assetDetails] of detailsByHolding.entries()) {
      const firstDetail = assetDetails[0];
      if (!firstDetail) {
        continue;
      }
      const holdingAssetId = holdingKey.split(':', 1)[0];
      const asset = assetsById.get(holdingAssetId);
      if (!asset) {
        continue;
      }

      if (
        (options.accountId &&
          firstDetail.transaction.account.id !== options.accountId) ||
        (options.portfolioId &&
          !firstDetail.transaction.account.portfolioHoldings.some(
            ({ assetId, portfolio }) =>
              assetId === holdingAssetId &&
              portfolio.id === options.portfolioId,
          ))
      ) {
        continue;
      }

      holdings.push(
        this.buildHolding(
          asset,
          assetDetails,
          pricesByAsset.get(asset.id),
          reportingCurrency,
          latestRate,
        ),
      );
    }

    holdings.push(
      ...this.buildFiatCashHoldings(
        accounts,
        reportingCurrency,
        latestRate,
        options,
      ),
    );

    return {
      holdings,
      baseCurrency: user.baseCurrency,
      reportingCurrency,
    };
  }

  async getSummaryForUser(
    user: AuthenticatedUser,
    options: ReportOptions = {},
  ): Promise<InvestmentSummaryResponse> {
    const { holdings, reportingCurrency } = await this.getHoldingsForUser(
      user,
      {
        ...options,
        groupBy: 'NONE',
      },
    );
    const assetHoldings = holdings.filter(
      (holding) => holding.holdingKind === 'ASSET',
    );
    const fiatCashHoldings = holdings.filter(
      (holding) => holding.holdingKind === 'FIAT_CASH',
    );
    const cashEquivalentHoldings = assetHoldings.filter(
      (holding) => holding.liquidityClass === 'CASH_EQUIVALENT',
    );
    const investedHoldings = assetHoldings.filter(
      (holding) => holding.liquidityClass === 'INVESTMENT',
    );
    const totalsByCurrency = this.buildNativeTotals(holdings);
    const combinedAssets =
      reportingCurrency === 'NATIVE'
        ? null
        : this.sumReportingHoldings(assetHoldings, reportingCurrency);
    const combinedAll =
      reportingCurrency === 'NATIVE'
        ? null
        : this.sumReportingHoldings(holdings, reportingCurrency);
    const sumCurrent = (items: readonly HoldingResponse[]) =>
      reportingCurrency === 'NATIVE'
        ? null
        : items.reduce(
            (total, holding) =>
              holding.currentValue ? total.add(holding.currentValue) : total,
            new Decimal(0),
          );
    const fiatCashValue = sumCurrent(fiatCashHoldings);
    const cashEquivalentValue = sumCurrent(cashEquivalentHoldings);
    const investedValue = sumCurrent(investedHoldings);
    const unpricedAssetCount = holdings.filter(
      (holding) => holding.currentValue === null,
    ).length;
    const missingHistoricalFxCount = holdings.filter(
      (holding) => holding.hasMissingHistoricalFx,
    ).length;

    return {
      data: {
        reportingCurrency,
        totalCostBasis: combinedAssets?.totalCostBasis ?? null,
        totalCurrentValue: combinedAssets?.totalCurrentValue ?? null,
        totalAccountValue: combinedAll?.totalCurrentValue ?? null,
        fiatCashValue: fiatCashValue?.toFixed(2) ?? null,
        cashEquivalentValue: cashEquivalentValue?.toFixed(2) ?? null,
        investedValue: investedValue?.toFixed(2) ?? null,
        totalLiquidity:
          fiatCashValue && cashEquivalentValue
            ? fiatCashValue.add(cashEquivalentValue).toFixed(2)
            : null,
        totalRealizedGain: combinedAssets?.totalRealizedGain ?? null,
        totalUnrealizedGain: combinedAssets?.totalUnrealizedGain ?? null,
        totalsByCurrency,
        currencyExposure: this.buildCurrencyExposure(
          holdings,
          reportingCurrency,
        ),
        isPartial: unpricedAssetCount > 0 || missingHistoricalFxCount > 0,
        unpricedAssetCount,
        missingHistoricalFxCount,
        exchangeRate: {
          baseCurrency: 'USD',
          quoteCurrency: 'PKR',
          rate: user.exchangeRate,
          source: user.exchangeRateSource,
          updatedAt: user.exchangeRateUpdatedAt,
        },
      },
    };
  }

  private buildHolding(
    asset: AssetRecord,
    details: readonly DetailRecord[],
    marketPrice: AssetPrice | undefined,
    reportingCurrency: ReportingCurrency,
    latestRate: Decimal | null,
  ): HoldingResponse {
    const firstDetail = details[0];
    if (!firstDetail) {
      throw new Error('A holding requires at least one transaction.');
    }
    const nativeCurrency =
      marketPrice?.currency ?? asset.priceCurrency ?? firstDetail.priceCurrency;
    const effectivePrice = marketPrice?.price
      ? new Decimal(marketPrice.price)
      : asset.currentPrice;
    const nativeCalculation = this.calculateInCurrency(
      asset.id,
      details,
      nativeCurrency,
      effectivePrice,
    );
    const outputCurrency =
      reportingCurrency === 'NATIVE' ? nativeCurrency : reportingCurrency;
    const reportingPrice = effectivePrice
      ? convertUsdPkr(
          effectivePrice,
          nativeCurrency,
          outputCurrency,
          latestRate,
        )
      : null;
    const reportingCalculation = this.calculateInCurrency(
      asset.id,
      details,
      outputCurrency,
      reportingPrice,
    );
    const quantityCalculation = calculateHolding({
      currentPrice: null,
      priceCurrency: nativeCurrency,
      transactions: holdingTransactionsForAsset(asset.id, details).map(
        (transaction) => ({
          ...transaction,
          price: new Decimal(0),
          fees: new Decimal(0),
        }),
      ),
    });
    const hasMissingHistoricalFx =
      nativeCalculation === null || reportingCalculation === null;
    const portfolios = firstDetail.transaction.account.portfolioHoldings
      .filter(({ assetId }) => assetId === asset.id)
      .map(({ portfolio }) => portfolio);

    return {
      holdingKind: 'ASSET',
      assetId: asset.id,
      assetName: asset.name,
      assetSymbol: asset.symbol,
      categoryName: asset.category.name,
      riskProfileName: asset.riskProfile?.name ?? null,
      accountId: firstDetail.transaction.account.id,
      accountName: firstDetail.transaction.account.name,
      accountCurrency: firstDetail.transaction.account.currency,
      portfolios,
      quantity: stripTrailingZeros(quantityCalculation.quantity.toFixed(8)),
      nativeCurrency,
      nativeAverageCost: toDecimalString(nativeCalculation?.averageCost),
      nativeCurrentPrice: toDecimalString(effectivePrice),
      nativeCostBasis: toMoneyString(nativeCalculation?.costBasis),
      nativeCurrentValue: toMoneyString(nativeCalculation?.currentValue),
      nativeRealizedGain: toMoneyString(nativeCalculation?.realizedGain),
      nativeUnrealizedGain: toMoneyString(nativeCalculation?.unrealizedGain),
      reportingCurrency: outputCurrency,
      averageCost: toDecimalString(reportingCalculation?.averageCost),
      currentPrice: toDecimalString(reportingPrice),
      costBasis: toMoneyString(reportingCalculation?.costBasis),
      currentValue: toMoneyString(reportingCalculation?.currentValue),
      realizedGain: toMoneyString(reportingCalculation?.realizedGain),
      unrealizedGain: toMoneyString(reportingCalculation?.unrealizedGain),
      unrealizedGainPercent:
        reportingCalculation?.unrealizedGainPercent?.toNumber() ?? null,
      priceProvider: marketPrice?.provider ?? null,
      priceStatus:
        marketPrice?.status ??
        (asset.currentPrice ? 'AVAILABLE' : 'UNAVAILABLE'),
      priceType: marketPrice?.priceType ?? 'CURRENT',
      priceUpdatedAt: marketPrice?.fetchedAt ?? null,
      providerDate: marketPrice?.providerDate ?? null,
      providerMarketAt: marketPrice?.providerMarketAt ?? null,
      priceChange: marketPrice?.change ?? null,
      priceChangePercent: marketPrice?.changePercent ?? null,
      hasMissingHistoricalFx,
      positionStatus: quantityCalculation.quantity.isZero()
        ? 'CLOSED'
        : 'ACTIVE',
      liquidityClass: asset.liquidityClass,
      liquidityClassSource: asset.liquidityClassSource,
    };
  }

  private calculateInCurrency(
    assetId: string,
    details: readonly DetailRecord[],
    currency: string,
    currentPrice: Decimal | null,
  ): ReturnType<typeof calculateHolding> | null {
    const transactions: InvestmentTransactionInput[] = [];

    for (const detail of details) {
      if (detail.settlementAssetId === assetId) {
        const price = convertUsdPkr(
          new Decimal(1),
          'USD',
          currency,
          detail.fxRateUsdToPkr,
        );
        if (!price) return null;
        transactions.push({
          type: detail.tradeType === 'BUY' ? 'WITHDRAWAL' : 'DEPOSIT',
          quantity:
            detail.tradeType === 'BUY'
              ? detail.grossAmount.add(detail.fees)
              : detail.grossAmount.sub(detail.fees),
          price,
          fees: new Decimal(0),
        });
        continue;
      }

      if (detail.tradeType === 'TRANSFER') {
        const price = detail.price.isZero()
          ? new Decimal(0)
          : convertUsdPkr(
              detail.price,
              detail.priceCurrency,
              currency,
              detail.fxRateUsdToPkr,
            );
        if (!price) return null;
        transactions.push({
          type: detail.transferDirection === 'IN' ? 'DEPOSIT' : 'WITHDRAWAL',
          quantity: detail.quantity,
          price,
          fees: new Decimal(0),
        });
        continue;
      }

      const rate = detail.fxRateUsdToPkr;
      const price = detail.price.isZero()
        ? new Decimal(0)
        : convertUsdPkr(detail.price, detail.priceCurrency, currency, rate);
      const fees = detail.fees.isZero()
        ? new Decimal(0)
        : convertUsdPkr(
            detail.fees,
            detail.transaction.currency,
            currency,
            rate,
          );

      if (!price || !fees) {
        return null;
      }

      transactions.push({
        type: detail.tradeType as InvestmentTransactionInput['type'],
        quantity: detail.quantity,
        price,
        fees,
      });
    }

    return calculateHolding({
      currentPrice,
      priceCurrency: currency,
      transactions,
    });
  }

  private sumReportingHoldings(
    holdings: readonly HoldingResponse[],
    currency: 'USD' | 'PKR',
  ): CurrencyTotal {
    return this.sumHoldingValues(
      currency,
      holdings.map((holding) => ({
        holdingKind: holding.holdingKind,
        liquidityClass: holding.liquidityClass,
        costBasis: holding.costBasis,
        currentValue: holding.currentValue,
        realizedGain: holding.realizedGain,
        unrealizedGain: holding.unrealizedGain,
      })),
    );
  }

  private buildNativeTotals(
    holdings: readonly HoldingResponse[],
  ): readonly CurrencyTotal[] {
    const grouped = new Map<string, HoldingResponse[]>();
    for (const holding of holdings) {
      const existing = grouped.get(holding.nativeCurrency) ?? [];
      grouped.set(holding.nativeCurrency, [...existing, holding]);
    }

    return [...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, currencyHoldings]) =>
        this.sumHoldingValues(
          currency,
          currencyHoldings.map((holding) => ({
            holdingKind: holding.holdingKind,
            liquidityClass: holding.liquidityClass,
            costBasis: holding.nativeCostBasis,
            currentValue: holding.nativeCurrentValue,
            realizedGain: holding.nativeRealizedGain,
            unrealizedGain: holding.nativeUnrealizedGain,
          })),
        ),
      );
  }

  private sumHoldingValues(
    currency: string,
    holdings: ReadonlyArray<{
      readonly holdingKind: HoldingResponse['holdingKind'];
      readonly liquidityClass: HoldingResponse['liquidityClass'];
      readonly costBasis: string | null;
      readonly currentValue: string | null;
      readonly realizedGain: string | null;
      readonly unrealizedGain: string | null;
    }>,
  ): CurrencyTotal {
    const sum = (field: keyof (typeof holdings)[number]): string =>
      holdings
        .reduce(
          (total, holding) =>
            holding[field] ? total.add(new Decimal(holding[field])) : total,
          new Decimal(0),
        )
        .toFixed(2);

    const currentValueFor = (
      predicate: (holding: (typeof holdings)[number]) => boolean,
    ) =>
      holdings
        .filter(predicate)
        .reduce(
          (total, holding) =>
            holding.currentValue ? total.add(holding.currentValue) : total,
          new Decimal(0),
        );
    const fiatCash = currentValueFor(
      (holding) => holding.holdingKind === 'FIAT_CASH',
    );
    const cashEquivalents = currentValueFor(
      (holding) => holding.liquidityClass === 'CASH_EQUIVALENT',
    );
    const invested = currentValueFor(
      (holding) => holding.liquidityClass === 'INVESTMENT',
    );
    return {
      currency,
      totalCostBasis: sum('costBasis'),
      totalCurrentValue: sum('currentValue'),
      totalRealizedGain: sum('realizedGain'),
      totalUnrealizedGain: sum('unrealizedGain'),
      totalAccountValue: currentValueFor(() => true).toFixed(2),
      fiatCashValue: fiatCash.toFixed(2),
      cashEquivalentValue: cashEquivalents.toFixed(2),
      investedValue: invested.toFixed(2),
      totalLiquidity: fiatCash.add(cashEquivalents).toFixed(2),
    };
  }

  private buildCurrencyExposure(
    holdings: readonly HoldingResponse[],
    reportingCurrency: ReportingCurrency,
  ): InvestmentSummaryResponse['data']['currencyExposure'] {
    const values = new Map<string, Decimal>();
    for (const holding of holdings) {
      const value =
        reportingCurrency === 'NATIVE'
          ? holding.nativeCurrentValue
          : holding.currentValue;
      if (!value) {
        continue;
      }
      const current = values.get(holding.nativeCurrency) ?? new Decimal(0);
      values.set(holding.nativeCurrency, current.add(value));
    }
    const total = [...values.values()].reduce(
      (sum, value) => sum.add(value),
      new Decimal(0),
    );

    return [...values.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, currentValue]) => ({
        currency,
        currentValue: currentValue.toFixed(2),
        sharePercent: total.isZero()
          ? null
          : currentValue
              .dividedBy(total)
              .times(100)
              .toDecimalPlaces(2)
              .toNumber(),
      }));
  }

  private groupDetailsByHolding(
    details: readonly DetailRecord[],
  ): ReadonlyMap<string, DetailRecord[]> {
    const groups = new Map<string, DetailRecord[]>();
    for (const detail of details) {
      for (const assetId of [detail.assetId, detail.settlementAssetId]) {
        if (!assetId) continue;
        const key = `${assetId}:${detail.transaction.account.id}`;
        const current = groups.get(key) ?? [];
        groups.set(key, [
          ...current,
          detail.tradeType === 'TRANSFER'
            ? { ...detail, transferDirection: 'OUT' }
            : detail,
        ]);
      }

      if (
        detail.tradeType === 'TRANSFER' &&
        detail.transaction.destinationAccount
      ) {
        const destination = detail.transaction.destinationAccount;
        const key = `${detail.assetId}:${destination.id}`;
        const current = groups.get(key) ?? [];
        groups.set(key, [
          ...current,
          {
            ...detail,
            transferDirection: 'IN',
            transaction: {
              ...detail.transaction,
              account: destination,
            },
          },
        ]);
      }
    }
    return groups;
  }

  private buildFiatCashHoldings(
    accounts: readonly InvestmentAccountRecord[],
    reportingCurrency: ReportingCurrency,
    latestRate: Decimal | null,
    options: ReportOptions,
  ): readonly HoldingResponse[] {
    if (
      (options.assetType && options.assetType.toLowerCase() !== 'cash') ||
      (options.currency &&
        !accounts.some((account) => account.currency === options.currency))
    ) {
      return [];
    }

    const rows: HoldingResponse[] = [];
    for (const account of accounts) {
      if (
        (options.accountId && account.id !== options.accountId) ||
        (options.currency && account.currency !== options.currency)
      ) {
        continue;
      }
      const balance = calculateAccountBalance(
        account.openingBalance,
        account.id,
        [...account.transactions, ...account.transfersIn],
      );
      const allocations = account.portfolioCashAllocations;
      const fragments: ReadonlyArray<{
        readonly suffix: string;
        readonly amount: Decimal;
        readonly portfolios: HoldingResponse['portfolios'];
      }> = options.portfolioId
        ? allocations
            .filter(({ portfolio }) => portfolio.id === options.portfolioId)
            .map(({ percentage, portfolio }) => ({
              suffix: portfolio.id,
              amount: balance.times(percentage).dividedBy(100),
              portfolios: [
                {
                  ...portfolio,
                  percentage: percentage.toFixed(2),
                },
              ],
            }))
        : options.groupBy === 'PORTFOLIO'
          ? this.buildPortfolioCashFragments(balance, allocations)
          : [
              {
                suffix: 'total',
                amount: balance,
                portfolios: allocations.map(({ percentage, portfolio }) => ({
                  ...portfolio,
                  percentage: percentage.toFixed(2),
                })),
              },
            ];

      for (const fragment of fragments) {
        if (fragment.amount.isZero() && !options.includeZeroCash) continue;
        rows.push(
          this.buildFiatCashHolding(
            account,
            fragment.amount,
            fragment.suffix,
            fragment.portfolios,
            reportingCurrency,
            latestRate,
          ),
        );
      }
    }
    return rows;
  }

  private buildPortfolioCashFragments(
    balance: Decimal,
    allocations: InvestmentAccountRecord['portfolioCashAllocations'],
  ): ReadonlyArray<{
    readonly suffix: string;
    readonly amount: Decimal;
    readonly portfolios: HoldingResponse['portfolios'];
  }> {
    const fragments = allocations.map(({ percentage, portfolio }) => ({
      suffix: portfolio.id,
      amount: balance.times(percentage).dividedBy(100),
      portfolios: [{ ...portfolio, percentage: percentage.toFixed(2) }],
    }));
    const allocated = allocations.reduce(
      (total, { percentage }) => total.add(percentage),
      new Decimal(0),
    );
    const remainder = new Decimal(100).sub(allocated);
    if (!remainder.isZero() || fragments.length === 0) {
      fragments.push({
        suffix: 'unallocated',
        amount: balance.times(remainder).dividedBy(100),
        portfolios: [],
      });
    }
    return fragments;
  }

  private buildFiatCashHolding(
    account: InvestmentAccountRecord,
    balance: Decimal,
    suffix: string,
    portfolios: HoldingResponse['portfolios'],
    reportingCurrency: ReportingCurrency,
    latestRate: Decimal | null,
  ): HoldingResponse {
    const outputCurrency =
      reportingCurrency === 'NATIVE' ? account.currency : reportingCurrency;
    const reportingValue = convertUsdPkr(
      balance,
      account.currency,
      outputCurrency,
      latestRate,
    );
    const reportingPrice = convertUsdPkr(
      new Decimal(1),
      account.currency,
      outputCurrency,
      latestRate,
    );
    return {
      holdingKind: 'FIAT_CASH',
      assetId: `fiat-cash:${account.id}:${suffix}`,
      assetName: 'Cash',
      assetSymbol: account.currency,
      categoryName: 'Cash',
      riskProfileName: null,
      accountId: account.id,
      accountName: account.name,
      accountCurrency: account.currency,
      portfolios,
      quantity: stripTrailingZeros(balance.toFixed(8)),
      nativeCurrency: account.currency,
      nativeAverageCost: null,
      nativeCurrentPrice: '1',
      nativeCostBasis: null,
      nativeCurrentValue: balance.toFixed(2),
      nativeRealizedGain: null,
      nativeUnrealizedGain: null,
      reportingCurrency: outputCurrency,
      averageCost: null,
      currentPrice: toDecimalString(reportingPrice),
      costBasis: null,
      currentValue: toMoneyString(reportingValue),
      realizedGain: null,
      unrealizedGain: null,
      unrealizedGainPercent: null,
      priceProvider: null,
      priceStatus: reportingValue ? 'AVAILABLE' : 'UNAVAILABLE',
      priceType: 'CURRENT',
      priceUpdatedAt: null,
      providerDate: null,
      providerMarketAt: null,
      priceChange: null,
      priceChangePercent: null,
      hasMissingHistoricalFx: false,
      positionStatus: balance.isZero() ? 'CLOSED' : 'ACTIVE',
      liquidityClass: 'FIAT_CASH',
      liquidityClassSource: 'AUTO',
    };
  }

  private async fetchInvestmentAccounts(
    userId: string,
  ): Promise<readonly InvestmentAccountRecord[]> {
    return this.prisma.account.findMany({
      where: { userId, type: { in: ['BROKER', 'CRYPTO_WALLET'] } },
      select: {
        id: true,
        name: true,
        currency: true,
        openingBalance: true,
        transactions: {
          where: { status: 'CLEARED', deletedAt: null },
          select: {
            type: true,
            accountId: true,
            destinationAccountId: true,
            amount: true,
          },
        },
        transfersIn: {
          where: { status: 'CLEARED', deletedAt: null },
          select: {
            type: true,
            accountId: true,
            destinationAccountId: true,
            amount: true,
          },
        },
        portfolioCashAllocations: {
          select: {
            percentage: true,
            portfolio: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  private async fetchAssets(userId: string): Promise<readonly AssetRecord[]> {
    return this.prisma.asset.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        symbol: true,
        currentPrice: true,
        priceCurrency: true,
        provider: true,
        providerAssetId: true,
        liquidityClass: true,
        liquidityClassSource: true,
        category: { select: { name: true } },
        riskProfile: { select: { name: true } },
      },
    });
  }

  private async fetchInvestmentDetails(
    userId: string,
  ): Promise<readonly DetailRecord[]> {
    return this.prisma.investmentTransactionDetail.findMany({
      where: {
        OR: [{ asset: { userId } }, { settlementAsset: { userId } }],
        transaction: {
          status: 'CLEARED',
          deletedAt: null,
          reversalOfId: null,
          reversal: { is: null },
        },
      },
      select: {
        id: true,
        assetId: true,
        settlementAssetId: true,
        tradeType: true,
        quantity: true,
        price: true,
        priceCurrency: true,
        fees: true,
        grossAmount: true,
        fxRateUsdToPkr: true,
        transaction: {
          select: {
            currency: true,
            occurredAt: true,
            account: {
              select: {
                id: true,
                name: true,
                currency: true,
                portfolioHoldings: {
                  select: {
                    assetId: true,
                    portfolio: { select: { id: true, name: true } },
                  },
                },
              },
            },
            destinationAccount: {
              select: {
                id: true,
                name: true,
                currency: true,
                portfolioHoldings: {
                  select: {
                    assetId: true,
                    portfolio: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { transaction: { occurredAt: 'asc' } },
    });
  }

  private toReportingCurrency(currency: string): 'USD' | 'PKR' {
    return currency === 'PKR' ? 'PKR' : 'USD';
  }
}

function toDecimalString(value: Decimal | null | undefined): string | null {
  return value ? stripTrailingZeros(value.toFixed(8)) : null;
}

function toMoneyString(value: Decimal | null | undefined): string | null {
  return value?.toFixed(2) ?? null;
}

function stripTrailingZeros(value: string): string {
  return value.includes('.') ? value.replace(/\.?0+$/, '') : value;
}
