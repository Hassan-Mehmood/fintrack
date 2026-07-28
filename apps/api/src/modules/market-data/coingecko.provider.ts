import { Injectable } from '@nestjs/common';
import type {
  MarketDataProvider,
  MarketSearchResult,
  ProviderQuote,
} from './market-data.types';
import { marketProviderFailureException } from './market-data.errors';
import { ProviderHttpService } from './provider-http.service';

@Injectable()
export class CoinGeckoProvider implements MarketDataProvider {
  readonly provider = 'COINGECKO' as const;

  constructor(private readonly http: ProviderHttpService) {}

  async search(query: string): Promise<readonly MarketSearchResult[]> {
    const url = new URL('https://api.coingecko.com/api/v3/search');
    url.searchParams.set('query', query);
    const payload = await this.http.getJson(this.provider, url, this.headers());

    if (!isRecord(payload) || !Array.isArray(payload.coins)) {
      throw marketProviderFailureException(this.provider);
    }

    return payload.coins
      .filter(isRecord)
      .filter(
        (coin) =>
          typeof coin.id === 'string' &&
          typeof coin.name === 'string' &&
          typeof coin.symbol === 'string',
      )
      .slice(0, 20)
      .map((coin) => ({
        name: String(coin.name),
        symbol: String(coin.symbol).toUpperCase(),
        type: 'CRYPTO' as const,
        provider: this.provider,
        providerAssetId: String(coin.id),
        exchange: null,
        imageUrl: typeof coin.thumb === 'string' ? coin.thumb : null,
        quoteCurrency: 'USD' as const,
      }));
  }

  async getQuotes(
    providerAssetIds: readonly string[],
  ): Promise<ReadonlyMap<string, ProviderQuote>> {
    if (providerAssetIds.length === 0) {
      return new Map();
    }

    const url = new URL('https://api.coingecko.com/api/v3/simple/price');
    url.searchParams.set('ids', providerAssetIds.join(','));
    url.searchParams.set('vs_currencies', 'usd');
    url.searchParams.set('include_24hr_change', 'true');
    url.searchParams.set('include_last_updated_at', 'true');
    url.searchParams.set('precision', 'full');
    const payload = await this.http.getJson(this.provider, url, this.headers());

    if (!isRecord(payload)) {
      throw marketProviderFailureException(this.provider);
    }

    const fetchedAt = new Date().toISOString();
    const quotes = new Map<string, ProviderQuote>();

    for (const providerAssetId of providerAssetIds) {
      const item = payload[providerAssetId];
      if (!isRecord(item) || !isPositiveNumber(item.usd)) {
        continue;
      }

      quotes.set(providerAssetId, {
        providerAssetId,
        price: String(item.usd),
        currency: 'USD',
        priceType: 'CURRENT',
        providerDate: null,
        providerMarketAt:
          typeof item.last_updated_at === 'number' && item.last_updated_at > 0
            ? new Date(item.last_updated_at * 1000).toISOString()
            : null,
        fetchedAt,
        open: null,
        high: null,
        low: null,
        close: null,
        adjustedClose: null,
        change: null,
        changePercent:
          typeof item.usd_24h_change === 'number'
            ? String(item.usd_24h_change)
            : null,
        volume: null,
        bid: null,
        ask: null,
      });
    }

    return quotes;
  }

  private headers(): Readonly<Record<string, string>> {
    const apiKey = process.env.COINGECKO_API_KEY;
    if (!apiKey) {
      throw marketProviderFailureException(this.provider);
    }
    return { 'x-cg-demo-api-key': apiKey };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
