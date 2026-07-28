import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  AssetMarketType,
  AssetProvider,
} from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';
import { CoinGeckoProvider } from './coingecko.provider';
import { EodhdProvider, quoteFromHistory } from './eodhd.provider';
import { FinnhubProvider } from './finnhub.provider';
import {
  invalidMarketHistoryException,
  invalidMarketSearchException,
  providerAssetNotFoundException,
  unsupportedMarketHistoryException,
} from './market-data.errors';
import type {
  AssetPrice,
  AssetPriceHistory,
  AssetPriceSource,
  MarketDataProvider,
  MarketExchange,
  MarketSearchResult,
  ProviderHistoryBar,
  ProviderQuote,
} from './market-data.types';
import { RedisCacheService } from './redis-cache.service';

const CURRENT_FRESH_PRICE_MS = 60_000;
const CURRENT_STALE_PRICE_TTL_SECONDS = 86_400;
const EOD_FRESH_PRICE_MS = 86_400_000;
const EOD_STALE_PRICE_TTL_SECONDS = 604_800;
const HISTORY_FRESH_MS = 86_400_000;
const HISTORY_STALE_TTL_SECONDS = 604_800;

interface CachedHistory {
  readonly fetchedAt: string;
  readonly bars: readonly ProviderHistoryBar[];
}

@Injectable()
export class MarketDataService {
  private readonly logger = new Logger(MarketDataService.name);
  private readonly inFlight = new Map<string, Promise<ProviderQuote | null>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
    private readonly finnhub: FinnhubProvider,
    private readonly coinGecko: CoinGeckoProvider,
    private readonly eodhd: EodhdProvider,
  ) {}

  async search(
    type: AssetMarketType,
    rawQuery: string,
    exchange?: MarketExchange,
  ): Promise<readonly MarketSearchResult[]> {
    const query = rawQuery.trim();
    if (query.length < 2 || query.length > 80) {
      throw invalidMarketSearchException();
    }
    return this.providerForSearch(type, exchange).search(query);
  }

  async listSymbols(exchange: 'PSX'): Promise<readonly MarketSearchResult[]> {
    if (exchange !== 'PSX') {
      throw invalidMarketSearchException();
    }
    return this.eodhd.listSymbols();
  }

  async verifyProviderAsset(
    type: AssetMarketType,
    provider: AssetProvider,
    providerAssetId: string,
  ): Promise<MarketSearchResult> {
    const selectedProvider = this.providerByName(provider);
    const normalizedProviderAssetId =
      provider === 'EODHD'
        ? canonicalEodhdId(providerAssetId)
        : providerAssetId;
    if (
      !normalizedProviderAssetId ||
      (type === 'CRYPTO' && provider !== 'COINGECKO') ||
      (type === 'STOCK' && provider === 'COINGECKO')
    ) {
      throw providerAssetNotFoundException(
        normalizedProviderAssetId ?? providerAssetId,
      );
    }

    const results = await selectedProvider.search(normalizedProviderAssetId);
    const result = results.find(
      (candidate) => candidate.providerAssetId === normalizedProviderAssetId,
    );
    if (!result) {
      throw providerAssetNotFoundException(normalizedProviderAssetId);
    }
    return result;
  }

  async getPricesForUser(
    user: AuthenticatedUser,
    assetIds: readonly string[],
  ): Promise<readonly AssetPrice[]> {
    const uniqueAssetIds = [...new Set(assetIds)];
    const assets = await this.prisma.asset.findMany({
      where: { userId: user.id, id: { in: uniqueAssetIds } },
      select: {
        id: true,
        provider: true,
        providerAssetId: true,
        currentPrice: true,
        priceCurrency: true,
      },
    });
    if (assets.length !== uniqueAssetIds.length) {
      throw assetNotFoundException();
    }
    return this.getPricesForSources(assets);
  }

  async getHistoryForUser(
    user: AuthenticatedUser,
    assetId: string,
    requestedFrom?: string,
    requestedTo?: string,
  ): Promise<AssetPriceHistory> {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, userId: user.id },
      select: { id: true, provider: true, providerAssetId: true },
    });
    if (!asset) throw assetNotFoundException();
    if (asset.provider !== 'EODHD' || !asset.providerAssetId) {
      throw unsupportedMarketHistoryException();
    }

    const { from, to } = historyRange(requestedFrom, requestedTo);
    const key = this.historyKey(asset.providerAssetId, from, to);
    const cached = await this.cache.getJson<CachedHistory>(key);
    if (
      cached &&
      Date.now() - new Date(cached.fetchedAt).getTime() <= HISTORY_FRESH_MS
    ) {
      return this.toHistory(asset, cached, 'AVAILABLE');
    }

    try {
      const history = await this.eodhd.getHistory(
        asset.providerAssetId,
        from,
        to,
      );
      if (history.bars.length === 0) {
        return cached
          ? this.toHistory(asset, cached, 'STALE')
          : this.unavailableHistory(asset);
      }
      await this.cache.setJson(key, history, HISTORY_STALE_TTL_SECONDS);
      const quote = quoteFromHistory(
        asset.providerAssetId,
        history.bars,
        history.fetchedAt,
      );
      if (quote) {
        await this.cache.setJson(
          this.quoteKey('EODHD', asset.providerAssetId),
          quote,
          EOD_STALE_PRICE_TTL_SECONDS,
        );
      }
      return this.toHistory(asset, history, 'AVAILABLE');
    } catch (error: unknown) {
      this.logger.warn(
        `EODHD history refresh failed: ${safeErrorMessage(error)}`,
      );
      return cached
        ? this.toHistory(asset, cached, 'STALE')
        : this.unavailableHistory(asset);
    }
  }

  async getPricesForSources(
    assets: readonly AssetPriceSource[],
  ): Promise<readonly AssetPrice[]> {
    const results = new Map<string, AssetPrice>();
    const staleQuotes = new Map<string, ProviderQuote>();
    const pendingByProvider = new Map<AssetProvider, AssetPriceSource[]>([
      ['FINNHUB', []],
      ['COINGECKO', []],
      ['EODHD', []],
    ]);

    for (const asset of assets) {
      if (!asset.provider || !asset.providerAssetId) {
        results.set(asset.id, manualPrice(asset));
        continue;
      }
      const cached = await this.cache.getJson<ProviderQuote>(
        this.quoteKey(asset.provider, asset.providerAssetId),
      );
      if (
        cached &&
        Date.now() - new Date(cached.fetchedAt).getTime() <=
          this.freshPriceMs(asset.provider)
      ) {
        results.set(asset.id, this.toAssetPrice(asset, cached, 'AVAILABLE'));
        continue;
      }
      if (cached) staleQuotes.set(asset.id, cached);
      pendingByProvider.get(asset.provider)?.push(asset);
    }

    await Promise.all(
      [...pendingByProvider.entries()].map(async ([provider, pending]) => {
        if (pending.length === 0) return;
        try {
          const quotes = await this.fetchProviderQuotes(provider, pending);
          for (const asset of pending) {
            const quote = quotes.get(asset.providerAssetId!);
            if (!quote) {
              this.useFallbackPrice(asset, staleQuotes, results);
              continue;
            }
            results.set(asset.id, this.toAssetPrice(asset, quote, 'AVAILABLE'));
            await this.cache.setJson(
              this.quoteKey(provider, asset.providerAssetId!),
              quote,
              this.stalePriceTtl(provider),
            );
          }
        } catch (error: unknown) {
          this.logger.warn(
            `${provider} quote refresh failed: ${safeErrorMessage(error)}`,
          );
          for (const asset of pending) {
            this.useFallbackPrice(asset, staleQuotes, results);
          }
        }
      }),
    );

    return assets.map(
      (asset) => results.get(asset.id) ?? unavailablePrice(asset),
    );
  }

  private async fetchProviderQuotes(
    provider: AssetProvider,
    assets: readonly AssetPriceSource[],
  ): Promise<ReadonlyMap<string, ProviderQuote>> {
    const ids = [
      ...new Set(
        assets
          .map((asset) => asset.providerAssetId)
          .filter((id): id is string => id !== null),
      ),
    ];
    if (provider === 'COINGECKO') {
      return this.coinGecko.getQuotes(ids);
    }

    const selectedProvider = this.providerByName(provider);
    const entries = await Promise.all(
      ids.map(async (id) => {
        const key = `${provider}:${id}`;
        let request = this.inFlight.get(key);
        if (!request) {
          request = selectedProvider
            .getQuotes([id])
            .then((quotes) => quotes.get(id) ?? null)
            .finally(() => this.inFlight.delete(key));
          this.inFlight.set(key, request);
        }
        return [id, await request] as const;
      }),
    );
    return new Map(
      entries.filter(
        (entry): entry is readonly [string, ProviderQuote] => entry[1] !== null,
      ),
    );
  }

  private useFallbackPrice(
    asset: AssetPriceSource,
    staleQuotes: ReadonlyMap<string, ProviderQuote>,
    results: Map<string, AssetPrice>,
  ): void {
    const stale = staleQuotes.get(asset.id);
    results.set(
      asset.id,
      stale
        ? this.toAssetPrice(asset, stale, 'STALE')
        : unavailablePrice(asset),
    );
  }

  private toAssetPrice(
    asset: AssetPriceSource,
    quote: ProviderQuote,
    status: 'AVAILABLE' | 'STALE',
  ): AssetPrice {
    return {
      assetId: asset.id,
      price: quote.price,
      currency: quote.currency,
      provider: asset.provider,
      priceType: quote.priceType,
      providerDate: quote.providerDate,
      providerMarketAt: quote.providerMarketAt,
      fetchedAt: quote.fetchedAt,
      open: quote.open,
      high: quote.high,
      low: quote.low,
      close: quote.close,
      adjustedClose: quote.adjustedClose,
      change: quote.change,
      changePercent: quote.changePercent,
      volume: quote.volume,
      bid: quote.bid,
      ask: quote.ask,
      status,
    };
  }

  private toHistory(
    asset: { id: string; providerAssetId: string | null },
    history: CachedHistory,
    status: 'AVAILABLE' | 'STALE',
  ): AssetPriceHistory {
    return {
      assetId: asset.id,
      provider: 'EODHD',
      providerAssetId: asset.providerAssetId!,
      currency: 'PKR',
      priceType: 'EOD',
      fetchedAt: history.fetchedAt,
      status,
      bars: history.bars,
    };
  }

  private unavailableHistory(asset: {
    id: string;
    providerAssetId: string | null;
  }): AssetPriceHistory {
    return {
      assetId: asset.id,
      provider: 'EODHD',
      providerAssetId: asset.providerAssetId!,
      currency: 'PKR',
      priceType: 'EOD',
      fetchedAt: null,
      status: 'UNAVAILABLE',
      bars: [],
    };
  }

  private providerForSearch(
    type: AssetMarketType,
    exchange?: MarketExchange,
  ): MarketDataProvider {
    if (type === 'CRYPTO') {
      if (exchange) throw invalidMarketSearchException();
      return this.coinGecko;
    }
    return exchange === 'PSX' ? this.eodhd : this.finnhub;
  }

  private providerByName(provider: AssetProvider): MarketDataProvider {
    if (provider === 'FINNHUB') return this.finnhub;
    if (provider === 'COINGECKO') return this.coinGecko;
    return this.eodhd;
  }

  private quoteKey(provider: AssetProvider, providerAssetId: string): string {
    const currency = provider === 'EODHD' ? 'PKR' : 'USD';
    return `market-data:quote:${provider}:${providerAssetId}:${currency}`;
  }

  private historyKey(
    providerAssetId: string,
    from: string,
    to: string,
  ): string {
    return `market-data:history:EODHD:${providerAssetId}:${from}:${to}:d`;
  }

  private freshPriceMs(provider: AssetProvider): number {
    return provider === 'EODHD' ? EOD_FRESH_PRICE_MS : CURRENT_FRESH_PRICE_MS;
  }

  private stalePriceTtl(provider: AssetProvider): number {
    return provider === 'EODHD'
      ? EOD_STALE_PRICE_TTL_SECONDS
      : CURRENT_STALE_PRICE_TTL_SECONDS;
  }
}

function manualPrice(asset: AssetPriceSource): AssetPrice {
  const price = asset.currentPrice?.toString() ?? null;
  return {
    assetId: asset.id,
    price,
    currency: asset.priceCurrency,
    provider: null,
    priceType: 'CURRENT',
    providerDate: null,
    providerMarketAt: null,
    fetchedAt: null,
    open: null,
    high: null,
    low: null,
    close: null,
    adjustedClose: null,
    change: null,
    changePercent: null,
    volume: null,
    bid: null,
    ask: null,
    status: price ? 'AVAILABLE' : 'UNAVAILABLE',
  };
}

function unavailablePrice(asset: AssetPriceSource): AssetPrice {
  return {
    assetId: asset.id,
    price: null,
    currency:
      asset.priceCurrency ?? (asset.provider === 'EODHD' ? 'PKR' : 'USD'),
    provider: asset.provider,
    priceType: asset.provider === 'EODHD' ? 'EOD' : 'CURRENT',
    providerDate: null,
    providerMarketAt: null,
    fetchedAt: null,
    open: null,
    high: null,
    low: null,
    close: null,
    adjustedClose: null,
    change: null,
    changePercent: null,
    volume: null,
    bid: null,
    ask: null,
    status: 'UNAVAILABLE',
  };
}

function historyRange(
  requestedFrom?: string,
  requestedTo?: string,
): { readonly from: string; readonly to: string } {
  const to = requestedTo ?? new Date().toISOString().slice(0, 10);
  const toDate = parseDateOnly(to);
  if (!toDate) throw invalidMarketHistoryException();
  const defaultFrom = new Date(toDate);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 30);
  const from = requestedFrom ?? defaultFrom.toISOString().slice(0, 10);
  const fromDate = parseDateOnly(from);
  if (!fromDate || fromDate > toDate) throw invalidMarketHistoryException();
  const spanDays = (toDate.getTime() - fromDate.getTime()) / 86_400_000;
  if (spanDays > 366) throw invalidMarketHistoryException();
  return { from, to };
}

function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
    ? null
    : parsed;
}

function canonicalEodhdId(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  if (!normalized) return null;
  const canonical = normalized.endsWith('.KAR')
    ? normalized
    : `${normalized}.KAR`;
  return /^[A-Z0-9._-]+\.KAR$/.test(canonical) ? canonical : null;
}

function assetNotFoundException(): NotFoundException {
  return new NotFoundException({
    error: {
      code: 'ASSET_NOT_FOUND',
      message: 'One or more requested assets were not found.',
      details: {},
    },
  });
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown provider error';
}
