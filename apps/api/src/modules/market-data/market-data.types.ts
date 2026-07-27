import type {
  AssetMarketType,
  AssetProvider,
} from '../../generated/prisma/enums';

export type PriceStatus = 'AVAILABLE' | 'STALE' | 'UNAVAILABLE';

export interface MarketSearchResult {
  readonly name: string;
  readonly symbol: string;
  readonly type: AssetMarketType;
  readonly provider: AssetProvider;
  readonly providerAssetId: string;
  readonly exchange: string | null;
  readonly imageUrl: string | null;
  readonly quoteCurrency: 'USD';
}

export interface ProviderQuote {
  readonly providerAssetId: string;
  readonly price: string;
  readonly currency: 'USD';
  readonly providerMarketAt: string | null;
  readonly fetchedAt: string;
  readonly changePercent: string | null;
}

export interface AssetPrice {
  readonly assetId: string;
  readonly price: string | null;
  readonly currency: string | null;
  readonly provider: AssetProvider | null;
  readonly providerMarketAt: string | null;
  readonly fetchedAt: string | null;
  readonly changePercent: string | null;
  readonly status: PriceStatus;
}

export interface MarketDataProvider {
  readonly provider: AssetProvider;
  search(query: string): Promise<readonly MarketSearchResult[]>;
  getQuotes(
    providerAssetIds: readonly string[],
  ): Promise<ReadonlyMap<string, ProviderQuote>>;
}

export interface AssetPriceSource {
  readonly id: string;
  readonly provider: AssetProvider | null;
  readonly providerAssetId: string | null;
  readonly currentPrice: { toString(): string } | null;
  readonly priceCurrency: string | null;
}
