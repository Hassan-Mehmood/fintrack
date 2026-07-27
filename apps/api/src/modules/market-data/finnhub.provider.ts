import { Injectable } from '@nestjs/common';
import type {
  MarketDataProvider,
  MarketSearchResult,
  ProviderQuote,
} from './market-data.types';
import { marketProviderFailureException } from './market-data.errors';
import { ProviderHttpService } from './provider-http.service';

@Injectable()
export class FinnhubProvider implements MarketDataProvider {
  readonly provider = 'FINNHUB' as const;
  private activeQuotes = 0;
  private readonly quoteWaiters: Array<() => void> = [];

  constructor(private readonly http: ProviderHttpService) {}

  async search(query: string): Promise<readonly MarketSearchResult[]> {
    const url = new URL('https://finnhub.io/api/v1/search');
    url.searchParams.set('q', query);
    url.searchParams.set('exchange', 'US');
    const payload = await this.http.getJson(this.provider, url, this.headers());

    if (!isRecord(payload) || !Array.isArray(payload.result)) {
      throw marketProviderFailureException(this.provider);
    }

    return payload.result
      .filter(isRecord)
      .filter(
        (item) =>
          typeof item.symbol === 'string' &&
          typeof item.displaySymbol === 'string' &&
          typeof item.description === 'string',
      )
      .slice(0, 20)
      .map((item) => ({
        name: String(item.description),
        symbol: String(item.displaySymbol),
        type: 'STOCK' as const,
        provider: this.provider,
        providerAssetId: String(item.symbol),
        exchange: 'US',
        imageUrl: null,
        quoteCurrency: 'USD' as const,
      }));
  }

  async getQuotes(
    providerAssetIds: readonly string[],
  ): Promise<ReadonlyMap<string, ProviderQuote>> {
    const entries = await Promise.all(
      providerAssetIds.map((providerAssetId) =>
        this.withQuotePermit(async () => {
          const url = new URL('https://finnhub.io/api/v1/quote');
          url.searchParams.set('symbol', providerAssetId);
          const payload = await this.http.getJson(
            this.provider,
            url,
            this.headers(),
          );

          if (!isRecord(payload) || !isPositiveNumber(payload.c)) {
            return null;
          }

          const fetchedAt = new Date().toISOString();
          const providerMarketAt =
            typeof payload.t === 'number' && payload.t > 0
              ? new Date(payload.t * 1000).toISOString()
              : null;

          return [
            providerAssetId,
            {
              providerAssetId,
              price: String(payload.c),
              currency: 'USD' as const,
              providerMarketAt,
              fetchedAt,
              changePercent:
                typeof payload.dp === 'number' ? String(payload.dp) : null,
            },
          ] as const;
        }),
      ),
    );

    return new Map(entries.filter((entry) => entry !== null));
  }

  private headers(): Readonly<Record<string, string>> {
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) {
      throw marketProviderFailureException(this.provider);
    }
    return { 'X-Finnhub-Token': apiKey };
  }

  private async withQuotePermit<T>(operation: () => Promise<T>): Promise<T> {
    if (this.activeQuotes >= 3) {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
