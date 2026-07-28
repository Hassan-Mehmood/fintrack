import { Injectable, Logger } from '@nestjs/common';
import { marketProviderFailureException } from './market-data.errors';
import type {
  MarketDataProvider,
  MarketSearchResult,
  ProviderHistoryBar,
  ProviderQuote,
} from './market-data.types';
import { ProviderHttpService } from './provider-http.service';
import { RedisCacheService } from './redis-cache.service';

const CATALOG_CACHE_KEY = 'market-data:catalog:EODHD:PSX';
const CATALOG_FRESH_MS = 86_400_000;
const CATALOG_STALE_TTL_SECONDS = 2_592_000;
const QUOTE_LOOKBACK_DAYS = 31;
const MAX_CONCURRENCY = 3;

interface CachedCatalog {
  readonly fetchedAt: string;
  readonly assets: readonly MarketSearchResult[];
}

@Injectable()
export class EodhdProvider implements MarketDataProvider {
  readonly provider = 'EODHD' as const;
  private readonly logger = new Logger(EodhdProvider.name);
  private catalogRequest: Promise<readonly MarketSearchResult[]> | null = null;
  private activeQuotes = 0;
  private readonly quoteWaiters: Array<() => void> = [];

  constructor(
    private readonly http: ProviderHttpService,
    private readonly cache: RedisCacheService,
  ) {}

  async search(query: string): Promise<readonly MarketSearchResult[]> {
    const normalizedQuery = query.trim().toUpperCase();
    const catalog = await this.listSymbols();

    return catalog
      .filter(
        (asset) =>
          asset.symbol.includes(normalizedQuery) ||
          asset.providerAssetId.includes(normalizedQuery) ||
          asset.name.toUpperCase().includes(normalizedQuery),
      )
      .sort(
        (left, right) =>
          searchRank(left, normalizedQuery) -
            searchRank(right, normalizedQuery) ||
          left.symbol.localeCompare(right.symbol),
      )
      .slice(0, 20);
  }

  async listSymbols(): Promise<readonly MarketSearchResult[]> {
    const cached = await this.cache.getJson<CachedCatalog>(CATALOG_CACHE_KEY);
    if (
      cached &&
      Date.now() - new Date(cached.fetchedAt).getTime() <= CATALOG_FRESH_MS
    ) {
      return cached.assets;
    }

    if (!this.catalogRequest) {
      this.catalogRequest = this.fetchCatalog()
        .catch((error: unknown) => {
          if (cached) {
            this.logger.warn('EODHD catalog refresh failed; using stale data.');
            return cached.assets;
          }
          throw error;
        })
        .finally(() => {
          this.catalogRequest = null;
        });
    }
    return this.catalogRequest;
  }

  async getQuotes(
    providerAssetIds: readonly string[],
  ): Promise<ReadonlyMap<string, ProviderQuote>> {
    const ids = [
      ...new Set(
        providerAssetIds
          .map(normalizeProviderAssetId)
          .filter((id): id is string => id !== null),
      ),
    ];
    const quotes = new Map<string, ProviderQuote>();
    await Promise.all(
      ids.map((id) =>
        this.withQuotePermit(async () => {
          try {
            const bars = await this.fetchHistory(
              id,
              dateDaysAgo(QUOTE_LOOKBACK_DAYS),
              today(),
              'd',
            );
            const quote = quoteFromHistory(id, bars, new Date().toISOString());
            if (quote) {
              quotes.set(id, quote);
            }
          } catch {
            this.logger.warn(`EODHD quote refresh failed for ${id}.`);
          }
        }),
      ),
    );
    return quotes;
  }

  async getHistory(
    providerAssetId: string,
    from: string,
    to: string,
  ): Promise<{
    readonly bars: readonly ProviderHistoryBar[];
    readonly fetchedAt: string;
  }> {
    const normalizedId = normalizeProviderAssetId(providerAssetId);
    if (!normalizedId) {
      return { bars: [], fetchedAt: new Date().toISOString() };
    }
    const bars = await this.fetchHistory(normalizedId, from, to, 'a');
    return { bars, fetchedAt: new Date().toISOString() };
  }

  private async fetchCatalog(): Promise<readonly MarketSearchResult[]> {
    const url = this.url('/exchange-symbol-list/KAR');
    url.searchParams.set('fmt', 'json');
    const payload = await this.http.getJson(this.provider, url, {});
    if (!Array.isArray(payload)) {
      throw marketProviderFailureException(this.provider);
    }

    const assets = payload
      .filter(isRecord)
      .filter(isSupportedInstrument)
      .map(normalizeCatalogItem)
      .filter((asset): asset is MarketSearchResult => asset !== null);
    const cached: CachedCatalog = {
      fetchedAt: new Date().toISOString(),
      assets,
    };
    await this.cache.setJson(
      CATALOG_CACHE_KEY,
      cached,
      CATALOG_STALE_TTL_SECONDS,
    );
    return assets;
  }

  private async fetchHistory(
    providerAssetId: string,
    from: string,
    to: string,
    order: 'a' | 'd',
  ): Promise<readonly ProviderHistoryBar[]> {
    const url = this.url(`/eod/${encodeURIComponent(providerAssetId)}`);
    url.searchParams.set('fmt', 'json');
    url.searchParams.set('period', 'd');
    url.searchParams.set('order', order);
    url.searchParams.set('from', from);
    url.searchParams.set('to', to);
    const payload = await this.http.getJson(
      this.provider,
      url,
      {},
      {
        notFoundAsNull: true,
      },
    );
    if (payload === null) {
      return [];
    }
    if (!Array.isArray(payload)) {
      throw marketProviderFailureException(this.provider);
    }
    return payload
      .map(normalizeHistoryBar)
      .filter((bar): bar is ProviderHistoryBar => bar !== null);
  }

  private url(path: string): URL {
    const token = process.env.EODHD_API_TOKEN?.trim();
    if (!token) {
      throw marketProviderFailureException(this.provider);
    }
    const baseUrl =
      process.env.EODHD_BASE_URL?.trim() || 'https://eodhd.com/api';
    try {
      const url = new URL(
        path.replace(/^\/+/, ''),
        `${baseUrl.replace(/\/$/, '')}/`,
      );
      url.searchParams.set('api_token', token);
      return url;
    } catch {
      throw marketProviderFailureException(this.provider);
    }
  }

  private async withQuotePermit<T>(operation: () => Promise<T>): Promise<T> {
    if (this.activeQuotes >= MAX_CONCURRENCY) {
      await new Promise<void>((resolve) => this.quoteWaiters.push(resolve));
    }
    this.activeQuotes += 1;
    try {
      return await operation();
    } finally {
      this.activeQuotes -= 1;
      this.quoteWaiters.shift()?.();
    }
  }
}

export function quoteFromHistory(
  providerAssetId: string,
  rawBars: readonly ProviderHistoryBar[],
  fetchedAt: string,
): ProviderQuote | null {
  const bars = [...rawBars].sort((a, b) =>
    b.providerDate.localeCompare(a.providerDate),
  );
  const latest = bars[0];
  if (!latest) return null;
  const previous = bars[1];
  const close = Number(latest.close);
  const previousClose = previous ? Number(previous.close) : null;
  const change =
    previousClose !== null && Number.isFinite(previousClose)
      ? close - previousClose
      : null;
  const changePercent =
    change !== null && previousClose !== null && previousClose !== 0
      ? (change / previousClose) * 100
      : null;

  return {
    providerAssetId,
    price: latest.close,
    currency: 'PKR',
    priceType: 'EOD',
    providerDate: latest.providerDate,
    providerMarketAt: null,
    fetchedAt,
    open: latest.open,
    high: latest.high,
    low: latest.low,
    close: latest.close,
    adjustedClose: latest.adjustedClose,
    change: change === null ? null : decimalString(change),
    changePercent: changePercent === null ? null : decimalString(changePercent),
    volume: latest.volume,
    bid: null,
    ask: null,
  };
}

function normalizeCatalogItem(
  item: Record<string, unknown>,
): MarketSearchResult | null {
  if (
    typeof item.Code !== 'string' ||
    item.Code.trim().length === 0 ||
    typeof item.Name !== 'string' ||
    item.Name.trim().length === 0
  ) {
    return null;
  }
  const symbol = item.Code.trim().toUpperCase();
  return {
    name: item.Name.trim(),
    symbol,
    type: 'STOCK',
    provider: 'EODHD',
    providerAssetId: `${symbol}.KAR`,
    exchange: 'PSX',
    imageUrl: null,
    quoteCurrency: 'PKR',
  };
}

function normalizeHistoryBar(value: unknown): ProviderHistoryBar | null {
  if (
    !isRecord(value) ||
    typeof value.date !== 'string' ||
    !isDateOnly(value.date) ||
    !isPositiveNumber(value.open) ||
    !isPositiveNumber(value.high) ||
    !isPositiveNumber(value.low) ||
    !isPositiveNumber(value.close)
  ) {
    return null;
  }
  return {
    providerDate: value.date,
    open: decimalString(value.open),
    high: decimalString(value.high),
    low: decimalString(value.low),
    close: decimalString(value.close),
    adjustedClose: isPositiveNumber(value.adjusted_close)
      ? decimalString(value.adjusted_close)
      : null,
    volume: isNonNegativeNumber(value.volume)
      ? decimalString(value.volume)
      : null,
  };
}

function isSupportedInstrument(item: Record<string, unknown>): boolean {
  if (typeof item.Type !== 'string') return false;
  return ['common stock', 'preferred stock', 'stock', 'etf'].includes(
    item.Type.trim().toLowerCase(),
  );
}

function normalizeProviderAssetId(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  if (!normalized) return null;
  const canonical = normalized.endsWith('.KAR')
    ? normalized
    : `${normalized}.KAR`;
  return /^[A-Z0-9._-]+\.KAR$/.test(canonical) ? canonical : null;
}

function searchRank(asset: MarketSearchResult, query: string): number {
  if (asset.symbol === query || asset.providerAssetId === query) return 0;
  if (asset.symbol.startsWith(query)) return 1;
  if (asset.name.toUpperCase().startsWith(query)) return 2;
  return 3;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function decimalString(value: number): string {
  return String(Number(value.toFixed(10)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}
