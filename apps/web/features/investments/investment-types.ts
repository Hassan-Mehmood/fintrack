export type ReportingCurrency = "USD" | "PKR" | "NATIVE";
export type HoldingGroupBy =
  "NONE" | "ACCOUNT" | "PORTFOLIO" | "ASSET_TYPE" | "CURRENCY";

export interface Holding {
  readonly holdingKind: "ASSET" | "FIAT_CASH";
  readonly assetId: string;
  readonly assetName: string;
  readonly assetSymbol: string | null;
  readonly categoryName: string;
  readonly riskProfileName: string | null;
  readonly accountId: string;
  readonly accountName: string;
  readonly accountCurrency: string;
  readonly portfolios: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly percentage?: string;
  }>;
  readonly quantity: string;
  readonly nativeCurrency: string;
  readonly nativeAverageCost: string | null;
  readonly nativeCurrentPrice: string | null;
  readonly nativeCostBasis: string | null;
  readonly nativeCurrentValue: string | null;
  readonly nativeRealizedGain: string | null;
  readonly nativeUnrealizedGain: string | null;
  readonly reportingCurrency: string;
  readonly averageCost: string | null;
  readonly currentPrice: string | null;
  readonly costBasis: string | null;
  readonly currentValue: string | null;
  readonly realizedGain: string | null;
  readonly unrealizedGain: string | null;
  readonly unrealizedGainPercent: number | null;
  readonly priceProvider: "FINNHUB" | "COINGECKO" | "EODHD" | null;
  readonly priceStatus: "AVAILABLE" | "STALE" | "UNAVAILABLE";
  readonly priceType: "CURRENT" | "EOD";
  readonly priceUpdatedAt: string | null;
  readonly providerDate: string | null;
  readonly providerMarketAt: string | null;
  readonly priceChange: string | null;
  readonly priceChangePercent: string | null;
  readonly hasMissingHistoricalFx: boolean;
  readonly positionStatus: "ACTIVE" | "CLOSED";
  readonly liquidityClass: "INVESTMENT" | "CASH_EQUIVALENT" | "FIAT_CASH";
  readonly liquidityClassSource: "AUTO" | "USER";
}

export interface CurrencyTotal {
  readonly currency: string;
  readonly totalCostBasis: string;
  readonly totalCurrentValue: string;
  readonly totalRealizedGain: string;
  readonly totalUnrealizedGain: string;
  readonly totalAccountValue: string;
  readonly fiatCashValue: string;
  readonly cashEquivalentValue: string;
  readonly investedValue: string;
  readonly totalLiquidity: string;
}

export interface InvestmentSummary {
  readonly reportingCurrency: ReportingCurrency;
  readonly totalCostBasis: string | null;
  readonly totalCurrentValue: string | null;
  readonly totalAccountValue: string | null;
  readonly fiatCashValue: string | null;
  readonly cashEquivalentValue: string | null;
  readonly investedValue: string | null;
  readonly totalLiquidity: string | null;
  readonly totalRealizedGain: string | null;
  readonly totalUnrealizedGain: string | null;
  readonly totalsByCurrency: readonly CurrencyTotal[];
  readonly currencyExposure: ReadonlyArray<{
    readonly currency: string;
    readonly currentValue: string;
    readonly sharePercent: number | null;
  }>;
  readonly isPartial: boolean;
  readonly unpricedAssetCount: number;
  readonly missingHistoricalFxCount: number;
  readonly exchangeRate: {
    readonly baseCurrency: "USD";
    readonly quoteCurrency: "PKR";
    readonly rate: string | null;
    readonly source: string;
    readonly updatedAt: string | null;
  };
}

export interface InvestmentFilters {
  readonly accountId?: string;
  readonly portfolioId?: string;
  readonly assetType?: string;
  readonly currency?: string;
}

export type PositionAssetInput =
  | { readonly kind: "EXISTING"; readonly assetId: string }
  | {
      readonly kind: "PROVIDER";
      readonly type: "STOCK" | "CRYPTO";
      readonly provider: "FINNHUB" | "COINGECKO" | "EODHD";
      readonly providerAssetId: string;
    }
  | {
      readonly kind: "MANUAL";
      readonly name: string;
      readonly symbol?: string;
      readonly categoryId: string;
      readonly riskProfileId?: string;
      readonly currentPrice?: string;
      readonly priceCurrency: "USD" | "PKR";
      readonly liquidityClass?: "INVESTMENT" | "CASH_EQUIVALENT";
    };

export interface CreatePositionPayload {
  readonly idempotencyKey: string;
  readonly mode: "OPENING" | "BUY";
  readonly asset: PositionAssetInput;
  readonly account:
    | { readonly kind: "EXISTING"; readonly accountId: string }
    | {
        readonly kind: "NEW";
        readonly name: string;
        readonly currency: "USD" | "PKR";
        readonly openingBalance: string;
      };
  readonly quantity: string;
  readonly costInput: "UNIT" | "TOTAL";
  readonly unitCost?: string;
  readonly totalCost?: string;
  readonly unitPrice?: string;
  readonly fees?: string;
  readonly historicalFxRate?: string;
  readonly settlementAsset?:
    | { readonly kind: "EXISTING"; readonly assetId: string }
    | {
        readonly kind: "PROVIDER";
        readonly provider: "COINGECKO";
        readonly providerAssetId: string;
      };
  readonly occurredAt: string;
  readonly portfolio?:
    | { readonly kind: "EXISTING"; readonly portfolioId: string }
    | { readonly kind: "NEW"; readonly name: string };
}
