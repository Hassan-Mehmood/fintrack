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
  readonly categoryId: string
  readonly categoryName: string
  readonly riskProfileId: string | null
  readonly riskProfileName: string | null
  readonly currentPrice: string | null
  readonly priceCurrency: string | null
  readonly notes: string | null
  readonly createdAt: string
  readonly updatedAt: string
}
