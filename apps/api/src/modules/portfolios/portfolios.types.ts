export interface PortfolioAccountItem {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly currency: string;
  readonly currentBalance: string;
}

export interface PortfolioAllocationItem {
  readonly category: string;
  readonly value: number;
}

export interface PortfolioMetrics {
  readonly totalValue: string;
  readonly totalCostBasis: string;
  readonly totalUnrealizedGain: string;
  readonly totalRealizedGain: string;
  readonly weightedRiskScore: number | null;
  readonly baseCurrency: string;
  readonly isPartial: boolean;
  readonly unpricedAssetCount: number;
}

export interface PortfolioResponse {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly accountCount: number;
  readonly accounts: readonly PortfolioAccountItem[];
  readonly metrics: PortfolioMetrics;
  readonly allocation: readonly PortfolioAllocationItem[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PortfoliosListResponse {
  readonly data: readonly PortfolioResponse[];
  readonly meta: {
    readonly total: number;
  };
}

export interface PortfolioItemResponse {
  readonly data: PortfolioResponse;
}

export interface DeletePortfolioResponse {
  readonly data: {
    readonly id: string;
    readonly deleted: true;
  };
}
