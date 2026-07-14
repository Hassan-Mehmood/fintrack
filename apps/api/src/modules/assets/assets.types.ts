export interface AssetCategoryResponse {
  readonly id: string;
  readonly name: string;
  readonly order: number;
}

export interface RiskProfileResponse {
  readonly id: string;
  readonly name: string;
  readonly score: number;
  readonly order: number;
}

export interface AssetResponse {
  readonly id: string;
  readonly name: string;
  readonly symbol: string | null;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly riskProfileId: string | null;
  readonly riskProfileName: string | null;
  readonly currentPrice: string | null;
  readonly priceCurrency: string | null;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AssetsListResponse {
  readonly data: readonly AssetResponse[];
  readonly meta: {
    readonly total: number;
  };
}

export interface AssetItemResponse {
  readonly data: AssetResponse;
}

export interface AssetMetadataResponse {
  readonly data: {
    readonly categories: readonly AssetCategoryResponse[];
    readonly riskProfiles: readonly RiskProfileResponse[];
  };
}

export interface DeleteAssetResponse {
  readonly data: {
    readonly id: string;
    readonly deleted: true;
  };
}
