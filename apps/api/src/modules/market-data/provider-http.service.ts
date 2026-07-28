import { Injectable } from '@nestjs/common';
import {
  marketProviderFailureException,
  marketProviderRateLimitException,
} from './market-data.errors';
import { RedisCacheService } from './redis-cache.service';

type MarketProvider = 'FINNHUB' | 'COINGECKO' | 'EODHD';

@Injectable()
export class ProviderHttpService {
  constructor(private readonly cache: RedisCacheService) {}

  async getJson(
    provider: MarketProvider,
    url: URL,
    headers: Readonly<Record<string, string>>,
    options: { readonly notFoundAsNull?: boolean } = {},
  ): Promise<unknown> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await this.consumeBudget(provider);
      let response: Response;
      try {
        response = await fetch(url, {
          headers,
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        if (attempt === 0) {
          continue;
        }
        throw marketProviderFailureException(provider);
      }

      if (response.ok) {
        try {
          return (await response.json()) as unknown;
        } catch {
          throw marketProviderFailureException(provider);
        }
      }

      if (response.status === 404 && options.notFoundAsNull) {
        return null;
      }

      const retryable =
        response.status === 429 ||
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504;

      if (!retryable || attempt === 1) {
        if (response.status === 429) {
          throw marketProviderRateLimitException(provider);
        }
        throw marketProviderFailureException(provider);
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    throw marketProviderFailureException(provider);
  }

  private async consumeBudget(provider: MarketProvider): Promise<void> {
    const isDailyBudget = provider === 'EODHD';
    const configuredLimit = isDailyBudget
      ? process.env.EODHD_REQUESTS_PER_DAY
      : provider === 'FINNHUB'
        ? process.env.FINNHUB_REQUESTS_PER_MINUTE
        : process.env.COINGECKO_REQUESTS_PER_MINUTE;
    const defaultLimit = provider === 'FINNHUB' ? 50 : 20;
    const limit = Number(configuredLimit ?? defaultLimit);
    const budgetWindow = isDailyBudget
      ? new Date().toISOString().slice(0, 10)
      : String(Math.floor(Date.now() / 60_000));
    const count = await this.cache.incrementWithExpiry(
      `market-data:budget:${provider}:${budgetWindow}`,
      isDailyBudget ? 172_800 : 120,
    );

    if (count > limit) {
      throw marketProviderRateLimitException(provider);
    }
  }
}
