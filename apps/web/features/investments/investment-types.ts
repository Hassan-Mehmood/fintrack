export interface Holding {
  readonly assetId: string
  readonly assetName: string
  readonly assetSymbol: string | null
  readonly categoryName: string
  readonly riskProfileName: string | null
  readonly quantity: string
  readonly averageCost: string | null
  readonly currentPrice: string | null
  readonly priceCurrency: string
  readonly priceProvider: "FINNHUB" | "COINGECKO" | null
  readonly priceStatus: "AVAILABLE" | "STALE" | "UNAVAILABLE"
  readonly priceUpdatedAt: string | null
  readonly providerMarketAt: string | null
  readonly priceChangePercent: string | null
  readonly costBasis: string
  readonly currentValue: string | null
  readonly realizedGain: string
  readonly unrealizedGain: string | null
  readonly unrealizedGainPercent: number | null
}

export interface InvestmentSummary {
  readonly totalCostBasis: string
  readonly totalCurrentValue: string
  readonly totalRealizedGain: string
  readonly totalUnrealizedGain: string
  readonly baseCurrency: string
  readonly isPartial: boolean
  readonly unpricedAssetCount: number
}
