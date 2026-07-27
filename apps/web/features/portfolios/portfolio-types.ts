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
  readonly totalCostBasis: string
  readonly totalUnrealizedGain: string
  readonly totalRealizedGain: string
  readonly weightedRiskScore: number | null
  readonly baseCurrency: string
}

export interface Portfolio {
  readonly id: string
  readonly name: string
  readonly description: string | null
  readonly accountCount: number
  readonly accounts: readonly PortfolioAccountItem[]
  readonly metrics: PortfolioMetrics
  readonly allocation: readonly PortfolioAllocationItem[]
  readonly createdAt: string
  readonly updatedAt: string
}

export interface PortfolioPayload {
  readonly name: string
  readonly description?: string
  readonly accountIds: readonly string[]
}
