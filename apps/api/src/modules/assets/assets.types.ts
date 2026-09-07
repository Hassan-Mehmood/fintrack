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
  readonly provider: 'FINNHUB' | 'COINGECKO' | 'EODHD' | null;
  readonly marketType: 'STOCK' | 'CRYPTO' | null;
  readonly domain: 'SECURITIES' | 'CRYPTO';
  readonly providerAssetId: string | null;
  readonly exchange: string | null;
  readonly imageUrl: string | null;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly riskProfileId: string | null;
  readonly riskProfileName: string | null;
  readonly currentPrice: string | null;
  readonly priceCurrency: string | null;
  readonly priceStatus: 'AVAILABLE' | 'STALE' | 'UNAVAILABLE';
  readonly priceType: 'CURRENT' | 'EOD';
  readonly priceUpdatedAt: string | null;
  readonly providerDate: string | null;
  readonly providerMarketAt: string | null;
  readonly priceOpen: string | null;
  readonly priceHigh: string | null;
  readonly priceLow: string | null;
  readonly priceClose: string | null;
  readonly priceAdjustedClose: string | null;
  readonly priceChange: string | null;
  readonly priceChangePercent: string | null;
  readonly priceVolume: string | null;
  readonly priceBid: string | null;
  readonly priceAsk: string | null;
  readonly notes: string | null;
  readonly liquidityClass: 'INVESTMENT' | 'CASH_EQUIVALENT';
  readonly liquidityClassSource: 'AUTO' | 'USER';
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
