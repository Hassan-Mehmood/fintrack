import { Injectable, Optional } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { CurrencyConverter } from '../../common/financial/currency-converter';
import {
  calculateHolding,
  type InvestmentTransactionInput,
} from '../../common/financial/holdings';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';
import { MarketDataService } from '../market-data/market-data.service';
import type { AssetPrice } from '../market-data/market-data.types';
import type {
  HoldingResponse,
  InvestmentSummaryResponse,
} from './investments.types';

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

@Injectable()
export class InvestmentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly marketData?: MarketDataService,
  ) {}

  async getHoldingsForUser(user: AuthenticatedUser): Promise<{
    readonly holdings: readonly HoldingResponse[];
    readonly baseCurrency: string;
  }> {
    const [assets, details] = await Promise.all([
      this.fetchAssets(user.id),
      this.fetchInvestmentDetails(user.id),
    ]);

    const detailsByAsset = this.groupDetailsByAsset(details);
    const prices = this.marketData
      ? await this.marketData.getPricesForSources(assets)
      : [];
    const pricesByAsset = new Map(
      prices.map((price) => [price.assetId, price]),
    );
    const converter = new CurrencyConverter(
      user.baseCurrency,
      user.exchangeRate,
    );

    const holdings: HoldingResponse[] = [];

    for (const asset of assets) {
      const assetDetails = detailsByAsset.get(asset.id);

      if (!assetDetails || assetDetails.length === 0) {
        continue;
      }

      const currency = this.resolveHoldingCurrency(asset, assetDetails);
      const marketPrice = pricesByAsset.get(asset.id);
      const calculation = calculateHolding({
        currentPrice: marketPrice?.price
          ? new Decimal(marketPrice.price)
          : asset.currentPrice,
        priceCurrency: currency,
        transactions: assetDetails.map((detail) => ({
          type: detail.tradeType as InvestmentTransactionInput['type'],
          quantity: detail.quantity,
          price: detail.price,
          fees: detail.fees,
        })),
      });

      holdings.push(
        this.toHoldingResponse(
          asset,
          calculation,
          marketPrice,
          currency,
          converter,
        ),
      );
    }

    return {
      holdings,
      baseCurrency: user.baseCurrency,
    };
  }

  async getSummaryForUser(
    user: AuthenticatedUser,
  ): Promise<InvestmentSummaryResponse> {
    const { holdings } = await this.getHoldingsForUser(user);

    let totalCostBasis = new Decimal(0);
    let totalCurrentValue = new Decimal(0);
    let totalRealizedGain = new Decimal(0);
    let totalUnrealizedGain = new Decimal(0);
    let unpricedAssetCount = 0;

    for (const holding of holdings) {
      totalCostBasis = totalCostBasis.add(holding.costBasis);
      if (holding.currentValue === null || holding.unrealizedGain === null) {
        unpricedAssetCount += 1;
        continue;
      }
      totalCurrentValue = totalCurrentValue.add(holding.currentValue);
      totalRealizedGain = totalRealizedGain.add(holding.realizedGain);
      totalUnrealizedGain = totalUnrealizedGain.add(holding.unrealizedGain);
    }

    return {
      data: {
        totalCostBasis: totalCostBasis.toFixed(2),
        totalCurrentValue: totalCurrentValue.toFixed(2),
        totalRealizedGain: totalRealizedGain.toFixed(2),
        totalUnrealizedGain: totalUnrealizedGain.toFixed(2),
        baseCurrency: user.baseCurrency,
        isPartial: unpricedAssetCount > 0,
        unpricedAssetCount,
      },
    };
  }

  private async fetchAssets(userId: string): Promise<
    ReadonlyArray<{
      readonly id: string;
      readonly name: string;
      readonly symbol: string | null;
      readonly currentPrice: Decimal | null;
      readonly priceCurrency: string | null;
      readonly provider: 'FINNHUB' | 'COINGECKO' | null;
      readonly providerAssetId: string | null;
      readonly category: { readonly name: string };
      readonly riskProfile: { readonly name: string } | null;
    }>
  > {
    return this.prisma.asset.findMany({
      where: {
        userId,
      },
      select: {
        id: true,
        name: true,
        symbol: true,
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
          },
        },
      },
    });
  }

  private async fetchInvestmentDetails(userId: string): Promise<
    ReadonlyArray<{
      readonly id: string;
      readonly assetId: string;
      readonly tradeType: string;
      readonly quantity: Decimal;
      readonly price: Decimal;
      readonly fees: Decimal;
      readonly transaction: {
        readonly currency: string;
      };
    }>
  > {
    return this.prisma.investmentTransactionDetail.findMany({
      where: {
        asset: {
          userId,
        },
      },
      select: {
        id: true,
        assetId: true,
        tradeType: true,
        quantity: true,
        price: true,
        fees: true,
        transaction: {
          select: {
            currency: true,
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
    details: ReadonlyArray<{
      readonly assetId: string;
      readonly tradeType: string;
      readonly quantity: Decimal;
      readonly price: Decimal;
      readonly fees: Decimal;
      readonly transaction: { readonly currency: string };
    }>,
  ): ReadonlyMap<string, typeof details> {
    const groups = new Map<string, typeof details>();

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

  private toHoldingResponse(
    asset: {
      readonly id: string;
      readonly name: string;
      readonly symbol: string | null;
      readonly currentPrice: Decimal | null;
      readonly category: { readonly name: string };
      readonly riskProfile: { readonly name: string } | null;
    },
    calculation: ReturnType<typeof calculateHolding>,
    marketPrice: AssetPrice | undefined,
    currency: string,
    converter: CurrencyConverter,
  ): HoldingResponse {
    const convertedCostBasis = converter.convert(
      calculation.costBasis,
      currency,
    );
    const convertedCurrentValue = calculation.currentValue
      ? converter.convert(calculation.currentValue, currency)
      : null;
    const convertedRealizedGain = converter.convert(
      calculation.realizedGain,
      currency,
    );
    const convertedUnrealizedGain = calculation.unrealizedGain
      ? converter.convert(calculation.unrealizedGain, currency)
      : null;
    const effectivePrice = marketPrice?.price
      ? new Decimal(marketPrice.price)
      : asset.currentPrice;
    const convertedCurrentPrice = effectivePrice
      ? converter.convert(effectivePrice, currency)
      : null;

    return {
      assetId: asset.id,
      assetName: asset.name,
      assetSymbol: asset.symbol,
      categoryName: asset.category.name,
      riskProfileName: asset.riskProfile?.name ?? null,
      quantity: stripTrailingZeros(calculation.quantity.toFixed(8)),
      averageCost: calculation.averageCost
        ? stripTrailingZeros(calculation.averageCost.toFixed(8))
        : null,
      currentPrice: convertedCurrentPrice
        ? stripTrailingZeros(convertedCurrentPrice.toFixed(8))
        : null,
      priceCurrency: converter.baseCurrency,
      priceProvider: marketPrice?.provider ?? null,
      priceStatus:
        marketPrice?.status ??
        (asset.currentPrice ? 'AVAILABLE' : 'UNAVAILABLE'),
      priceUpdatedAt: marketPrice?.fetchedAt ?? null,
      providerMarketAt: marketPrice?.providerMarketAt ?? null,
      priceChangePercent: marketPrice?.changePercent ?? null,
      costBasis: convertedCostBasis.toFixed(2),
      currentValue: convertedCurrentValue?.toFixed(2) ?? null,
      realizedGain: convertedRealizedGain.toFixed(2),
      unrealizedGain: convertedUnrealizedGain?.toFixed(2) ?? null,
      unrealizedGainPercent:
        calculation.unrealizedGainPercent?.toNumber() ?? null,
    };
  }
}

function stripTrailingZeros(value: string): string {
  if (!value.includes('.')) {
    return value;
  }

  return value.replace(/\.?0+$/, '');
}
