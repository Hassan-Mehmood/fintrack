export interface AssetCategory {
  readonly id: string
  readonly name: string
  readonly order: number
}

export interface RiskProfile {
  readonly id: string
  readonly name: string
  readonly score: number
  readonly order: number
}

export interface Asset {
  readonly id: string
  readonly name: string
  readonly symbol: string | null
  readonly provider: "FINNHUB" | "COINGECKO" | null
  readonly marketType: "STOCK" | "CRYPTO" | null
  readonly providerAssetId: string | null
  readonly exchange: string | null
  readonly imageUrl: string | null
  readonly categoryId: string
  readonly categoryName: string
  readonly riskProfileId: string | null
  readonly riskProfileName: string | null
  readonly currentPrice: string | null
  readonly priceCurrency: string | null
  readonly priceStatus: "AVAILABLE" | "STALE" | "UNAVAILABLE"
  readonly priceUpdatedAt: string | null
  readonly providerMarketAt: string | null
  readonly priceChangePercent: string | null
  readonly notes: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface MarketSearchResult {
  readonly name: string
  readonly symbol: string
  readonly type: "STOCK" | "CRYPTO"
  readonly provider: "FINNHUB" | "COINGECKO"
  readonly providerAssetId: string
  readonly exchange: string | null
  readonly imageUrl: string | null
  readonly quoteCurrency: "USD"
}
