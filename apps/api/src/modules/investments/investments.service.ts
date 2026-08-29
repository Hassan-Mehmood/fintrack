import { Injectable, Optional } from '@nestjs/common';
import { convertUsdPkr } from '../../common/financial/fx-conversion';
import {
  calculateHolding,
  type InvestmentTransactionInput,
} from '../../common/financial/holdings';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MarketDataService } from '../market-data/market-data.service';
import type { AssetPrice } from '../market-data/market-data.types';
import type {
  CurrencyTotal,
  HoldingResponse,
  InvestmentSummaryResponse,
  ReportingCurrency,
} from './investments.types';

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
  readonly category: { readonly name: string };
  readonly riskProfile: { readonly name: string } | null;
}

interface DetailRecord {
  readonly id: string;
  readonly assetId: string;
  readonly tradeType: string;
  readonly quantity: Decimal;
  readonly price: Decimal;
  readonly priceCurrency: string;
  readonly fees: Decimal;
  readonly fxRateUsdToPkr: Decimal | null;
  readonly transaction: {
    readonly currency: string;
    readonly occurredAt: Date;
    readonly account: {
      readonly id: string;
      readonly name: string;
      readonly currency: string;
      readonly portfolios: ReadonlyArray<{
        readonly portfolio: {
          readonly id: string;
          readonly name: string;
        };
      }>;
    };
  };
}

interface ReportOptions {
  readonly reportingCurrency?: ReportingCurrency;
  readonly accountId?: string;
  readonly portfolioId?: string;
  readonly assetType?: string;
  readonly currency?: string;
}

@Injectable()
export class InvestmentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly marketData?: MarketDataService,
  ) {}

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
    const [assets, details] = await Promise.all([
      this.fetchAssets(user.id),
      this.fetchInvestmentDetails(user.id),
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
        assetIds.has(detail.assetId) &&
        (!options.accountId ||
          detail.transaction.account.id === options.accountId) &&
        (!options.portfolioId ||
          detail.transaction.account.portfolios.some(
            ({ portfolio }) => portfolio.id === options.portfolioId,
          )),
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

    for (const assetDetails of detailsByHolding.values()) {
      const firstDetail = assetDetails[0];
      if (!firstDetail) {
        continue;
      }
      const asset = assetsById.get(firstDetail.assetId);
      if (!asset) {
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
      options,
    );
    const totalsByCurrency = this.buildNativeTotals(holdings);
    const combined =
      reportingCurrency === 'NATIVE'
        ? null
        : this.sumReportingHoldings(holdings, reportingCurrency);
    const unpricedAssetCount = holdings.filter(
      (holding) => holding.currentValue === null,
    ).length;
    const missingHistoricalFxCount = holdings.filter(
      (holding) => holding.hasMissingHistoricalFx,
    ).length;

    return {
      data: {
        reportingCurrency,
        totalCostBasis: combined?.totalCostBasis ?? null,
        totalCurrentValue: combined?.totalCurrentValue ?? null,
        totalRealizedGain: combined?.totalRealizedGain ?? null,
        totalUnrealizedGain: combined?.totalUnrealizedGain ?? null,
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
      details,
      outputCurrency,
      reportingPrice,
    );
    const quantityCalculation = calculateHolding({
      currentPrice: null,
      priceCurrency: nativeCurrency,
      transactions: details.map((detail) => ({
        type: detail.tradeType as InvestmentTransactionInput['type'],
        quantity: detail.quantity,
        price: new Decimal(0),
        fees: new Decimal(0),
      })),
    });
    const hasMissingHistoricalFx =
      nativeCalculation === null || reportingCalculation === null;
    const portfolios = firstDetail.transaction.account.portfolios.map(
      ({ portfolio }) => portfolio,
    );

    return {
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
    };
  }

  private calculateInCurrency(
    details: readonly DetailRecord[],
    currency: string,
    currentPrice: Decimal | null,
  ): ReturnType<typeof calculateHolding> | null {
    const transactions: InvestmentTransactionInput[] = [];

    for (const detail of details) {
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

    return {
      currency,
      totalCostBasis: sum('costBasis'),
      totalCurrentValue: sum('currentValue'),
      totalRealizedGain: sum('realizedGain'),
      totalUnrealizedGain: sum('unrealizedGain'),
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
      const key = `${detail.assetId}:${detail.transaction.account.id}`;
      const current = groups.get(key) ?? [];
      groups.set(key, [...current, detail]);
    }
    return groups;
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
        asset: { userId },
        transaction: {
          status: 'CLEARED',
          deletedAt: null,
        },
      },
      select: {
        id: true,
        assetId: true,
        tradeType: true,
        quantity: true,
        price: true,
        priceCurrency: true,
        fees: true,
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
                portfolios: {
                  select: {
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
