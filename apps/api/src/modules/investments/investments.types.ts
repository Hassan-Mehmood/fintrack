export interface HoldingResponse {
  readonly assetId: string;
  readonly assetName: string;
  readonly assetSymbol: string | null;
  readonly categoryName: string;
  readonly riskProfileName: string | null;
  readonly quantity: string;
  readonly averageCost: string | null;
  readonly currentPrice: string | null;
  readonly priceCurrency: string;
  readonly costBasis: string;
  readonly currentValue: string;
  readonly realizedGain: string;
  readonly unrealizedGain: string;
  readonly unrealizedGainPercent: number | null;
}

export interface HoldingsListResponse {
  readonly data: readonly HoldingResponse[];
  readonly meta: {
    readonly total: number;
    readonly baseCurrency: string;
  };
}

export interface InvestmentSummaryResponse {
  readonly data: {
    readonly totalCostBasis: string;
    readonly totalCurrentValue: string;
    readonly totalRealizedGain: string;
    readonly totalUnrealizedGain: string;
    readonly baseCurrency: string;
  };
}
