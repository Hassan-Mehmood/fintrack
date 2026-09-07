export interface PortfolioAccountItem {
  readonly id: string
  readonly name: string
  readonly type: string
  readonly currency: string
  readonly currentBalance: string
}

export interface PortfolioAllocationItem {
  readonly category: string
  readonly value: number
}

export interface PortfolioMetrics {
  readonly totalValue: string
  readonly totalCostBasis: string | null
  readonly totalUnrealizedGain: string | null
  readonly totalRealizedGain: string | null
  readonly weightedRiskScore: number | null
  readonly baseCurrency: string
  readonly isPartial: boolean
  readonly unpricedAssetCount: number
  readonly unknownCostBasisCount: number
}

export interface Portfolio {
  readonly domain: "SECURITIES" | "CRYPTO"
  readonly id: string
  readonly name: string
  readonly description: string | null
  readonly accountCount: number
  readonly accounts: readonly PortfolioAccountItem[]
  readonly holdings: ReadonlyArray<{ readonly accountId: string; readonly assetId: string }>
  readonly cashAllocations: ReadonlyArray<{ readonly accountId: string; readonly percentage: string }>
  readonly metrics: PortfolioMetrics
  readonly allocation: readonly PortfolioAllocationItem[]
  readonly createdAt: string
  readonly updatedAt: string
}

export interface PortfolioPayload {
  readonly domain?: "SECURITIES" | "CRYPTO"
  readonly name: string
  readonly description?: string
  readonly accountIds?: readonly string[]
  readonly holdings?: ReadonlyArray<{ readonly accountId: string; readonly assetId: string }>
  readonly cashAllocations?: ReadonlyArray<{ readonly accountId: string; readonly percentage: string }>
}
