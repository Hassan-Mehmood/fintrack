import type {
  AssetMarketType,
  AssetProvider,
} from '../../generated/prisma/enums';

export type PriceStatus = 'AVAILABLE' | 'STALE' | 'UNAVAILABLE';
export type PriceType = 'CURRENT' | 'EOD';
export type MarketExchange = 'US' | 'PSX';
export type QuoteCurrency = 'USD' | 'PKR';

export interface MarketSearchResult {
  readonly name: string;
  readonly symbol: string;
  readonly type: AssetMarketType;
  readonly provider: AssetProvider;
  readonly providerAssetId: string;
  readonly exchange: string | null;
  readonly imageUrl: string | null;
  readonly quoteCurrency: QuoteCurrency;
}

export interface ProviderQuote {
  readonly providerAssetId: string;
  readonly price: string;
  readonly currency: QuoteCurrency;
  readonly priceType: PriceType;
  readonly providerDate: string | null;
  readonly providerMarketAt: string | null;
  readonly fetchedAt: string;
  readonly open: string | null;
  readonly high: string | null;
  readonly low: string | null;
  readonly close: string | null;
  readonly adjustedClose: string | null;
  readonly change: string | null;
  readonly changePercent: string | null;
  readonly volume: string | null;
  readonly bid: string | null;
  readonly ask: string | null;
}

export interface AssetPrice {
  readonly assetId: string;
  readonly price: string | null;
  readonly currency: string | null;
  readonly provider: AssetProvider | null;
  readonly priceType: PriceType;
  readonly providerDate: string | null;
  readonly providerMarketAt: string | null;
  readonly fetchedAt: string | null;
  readonly open: string | null;
  readonly high: string | null;
  readonly low: string | null;
  readonly close: string | null;
  readonly adjustedClose: string | null;
  readonly change: string | null;
  readonly changePercent: string | null;
  readonly volume: string | null;
  readonly bid: string | null;
  readonly ask: string | null;
  readonly status: PriceStatus;
}

export interface ProviderHistoryBar {
  readonly providerDate: string;
  readonly open: string;
  readonly high: string;
  readonly low: string;
  readonly close: string;
  readonly adjustedClose: string | null;
  readonly volume: string | null;
}

export interface AssetPriceHistory {
  readonly assetId: string;
  readonly provider: 'EODHD';
  readonly providerAssetId: string;
  readonly currency: 'PKR';
  readonly priceType: 'EOD';
  readonly fetchedAt: string | null;
  readonly status: PriceStatus;
  readonly bars: readonly ProviderHistoryBar[];
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
