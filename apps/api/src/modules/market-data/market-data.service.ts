import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  AssetMarketType,
  AssetProvider,
} from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';
import { CoinGeckoProvider } from './coingecko.provider';
import { FinnhubProvider } from './finnhub.provider';
import {
  invalidMarketSearchException,
  providerAssetNotFoundException,
} from './market-data.errors';
import type {
  AssetPrice,
  AssetPriceSource,
  MarketDataProvider,
  MarketSearchResult,
  ProviderQuote,
} from './market-data.types';
import { RedisCacheService } from './redis-cache.service';

const FRESH_PRICE_MS = 60_000;
const STALE_PRICE_TTL_SECONDS = 86_400;

@Injectable()
export class MarketDataService {
  private readonly logger = new Logger(MarketDataService.name);
  private readonly inFlight = new Map<string, Promise<ProviderQuote | null>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
    private readonly finnhub: FinnhubProvider,
    private readonly coinGecko: CoinGeckoProvider,
  ) {}

  async search(
    type: AssetMarketType,
    rawQuery: string,
  ): Promise<readonly MarketSearchResult[]> {
    const query = rawQuery.trim();
    if (query.length < 2 || query.length > 80) {
      throw invalidMarketSearchException();
    }
    return this.providerForType(type).search(query);
  }

  async verifyProviderAsset(
    type: AssetMarketType,
    provider: AssetProvider,
    providerAssetId: string,
  ): Promise<MarketSearchResult> {
    if (this.providerForType(type).provider !== provider) {
      throw providerAssetNotFoundException(providerAssetId);
    }

    const results = await this.providerForType(type).search(providerAssetId);
    const result = results.find(
      (candidate) => candidate.providerAssetId === providerAssetId,
    );

    if (!result) {
      throw providerAssetNotFoundException(providerAssetId);
    }
    return result;
  }

  async getPricesForUser(
    user: AuthenticatedUser,
    assetIds: readonly string[],
  ): Promise<readonly AssetPrice[]> {
    const uniqueAssetIds = [...new Set(assetIds)];
    const assets = await this.prisma.asset.findMany({
      where: {
        userId: user.id,
        id: { in: uniqueAssetIds },
      },
      select: {
        id: true,
        provider: true,
        providerAssetId: true,
        currentPrice: true,
        priceCurrency: true,
      },
    });

    if (assets.length !== uniqueAssetIds.length) {
      throw new NotFoundException({
        error: {
          code: 'ASSET_NOT_FOUND',
          message: 'One or more requested assets were not found.',
          details: {},
        },
      });
    }

    return this.getPricesForSources(assets);
  }

  async getPricesForSources(
    assets: readonly AssetPriceSource[],
  ): Promise<readonly AssetPrice[]> {
    const results = new Map<string, AssetPrice>();
    const staleQuotes = new Map<string, ProviderQuote>();
    const pendingByProvider = new Map<AssetProvider, AssetPriceSource[]>([
      ['FINNHUB', []],
      ['COINGECKO', []],
    ]);

    for (const asset of assets) {
      if (!asset.provider || !asset.providerAssetId) {
        results.set(asset.id, {
          assetId: asset.id,
          price: asset.currentPrice?.toString() ?? null,
          currency: asset.priceCurrency,
          provider: null,
          providerMarketAt: null,
          fetchedAt: null,
          changePercent: null,
          status: asset.currentPrice ? 'AVAILABLE' : 'UNAVAILABLE',
        });
        continue;
      }

      const cached = await this.cache.getJson<ProviderQuote>(
        this.quoteKey(asset.provider, asset.providerAssetId),
      );
      if (
        cached &&
        Date.now() - new Date(cached.fetchedAt).getTime() <= FRESH_PRICE_MS
      ) {
        results.set(asset.id, this.toAssetPrice(asset, cached, 'AVAILABLE'));
        continue;
      }
      if (cached) {
        staleQuotes.set(asset.id, cached);
      }
      pendingByProvider.get(asset.provider)?.push(asset);
    }

    await Promise.all(
      [...pendingByProvider.entries()].map(async ([provider, pending]) => {
        if (pending.length === 0) {
          return;
        }

        try {
          const quotes = await this.fetchProviderQuotes(provider, pending);
          for (const asset of pending) {
            const quote = quotes.get(asset.providerAssetId!);
            if (quote) {
              results.set(
                asset.id,
                this.toAssetPrice(asset, quote, 'AVAILABLE'),
              );
              await this.cache.setJson(
                this.quoteKey(provider, asset.providerAssetId!),
                quote,
                STALE_PRICE_TTL_SECONDS,
              );
              continue;
            }
            this.useFallbackPrice(asset, staleQuotes, results);
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
      (asset) =>
        results.get(asset.id) ?? {
          assetId: asset.id,
          price: null,
          currency: asset.priceCurrency,
          provider: asset.provider,
          providerMarketAt: null,
          fetchedAt: null,
          changePercent: null,
          status: 'UNAVAILABLE',
        },
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

    const entries = await Promise.all(
      ids.map(async (id) => {
        const key = `${provider}:${id}`;
        let request = this.inFlight.get(key);
        if (!request) {
          request = this.finnhub
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
        : {
            assetId: asset.id,
            price: null,
            currency: asset.priceCurrency ?? 'USD',
            provider: asset.provider,
            providerMarketAt: null,
            fetchedAt: null,
            changePercent: null,
            status: 'UNAVAILABLE',
          },
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
      providerMarketAt: quote.providerMarketAt,
      fetchedAt: quote.fetchedAt,
      changePercent: quote.changePercent,
      status,
    };
  }

  private providerForType(type: AssetMarketType): MarketDataProvider {
    return type === 'STOCK' ? this.finnhub : this.coinGecko;
  }

  private quoteKey(provider: AssetProvider, providerAssetId: string): string {
    return `market-data:quote:${provider}:${providerAssetId}:USD`;
  }
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown provider error';
}
