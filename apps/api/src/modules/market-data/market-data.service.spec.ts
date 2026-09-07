import { MarketDataService } from './market-data.service';

describe('MarketDataService', () => {
  it('routes stock searches by exchange while preserving the US default', async () => {
    const finnhub = providerMock('FINNHUB');
    const coinGecko = providerMock('COINGECKO');
    const eodhd = providerMock('EODHD');
    const service = createService({}, {}, finnhub, coinGecko, eodhd);

    await service.search('STOCK', 'apple');
    await service.search('STOCK', 'lucky', 'PSX');

    expect(finnhub.search).toHaveBeenCalledWith('apple');
    expect(eodhd.search).toHaveBeenCalledWith('lucky');
    expect(coinGecko.search).not.toHaveBeenCalled();
  });

  it('returns the cached EODHD symbol listing', async () => {
    const eodhd = providerMock('EODHD');
    eodhd.listSymbols.mockResolvedValue([{ providerAssetId: 'LUCK.KAR' }]);
    const service = createService(
      {},
      {},
      providerMock('FINNHUB'),
      providerMock('COINGECKO'),
      eodhd,
    );

    await expect(service.listSymbols('PSX')).resolves.toEqual([
      { providerAssetId: 'LUCK.KAR' },
    ]);
  });

  it('rejects an exchange parameter for cryptocurrency searches', async () => {
    const service = createService(
      {},
      {},
      providerMock('FINNHUB'),
      providerMock('COINGECKO'),
      providerMock('EODHD'),
    );
    await expect(
      service.search('CRYPTO', 'bitcoin', 'PSX'),
    ).rejects.toMatchObject({
      response: { error: { code: 'INVALID_MARKET_SEARCH' } },
    });
  });

  it('canonicalizes and revalidates EODHD provider symbols', async () => {
    const eodhd = providerMock('EODHD');
    eodhd.search.mockResolvedValue([
      {
        name: 'Lucky Cement Limited',
        symbol: 'LUCK',
        type: 'STOCK',
        provider: 'EODHD',
        providerAssetId: 'LUCK.KAR',
        exchange: 'PSX',
        imageUrl: null,
        quoteCurrency: 'PKR',
      },
    ]);
    const service = createService(
      {},
      {},
      providerMock('FINNHUB'),
      providerMock('COINGECKO'),
      eodhd,
    );

    await expect(
      service.verifyProviderAsset('STOCK', 'EODHD', ' luck '),
    ).resolves.toEqual(
      expect.objectContaining({
        providerAssetId: 'LUCK.KAR',
        exchange: 'PSX',
      }),
    );
    expect(eodhd.search).toHaveBeenCalledWith('LUCK.KAR');
  });

  it('revalidates cryptocurrencies by exact CoinGecko id', async () => {
    const coinGecko = providerMock('COINGECKO');
    coinGecko.getAssetById.mockResolvedValue({
      name: 'BNB',
      symbol: 'BNB',
      type: 'CRYPTO',
      provider: 'COINGECKO',
      providerAssetId: 'binancecoin',
      exchange: null,
      imageUrl: null,
      quoteCurrency: 'USD',
    });
    const service = createService(
      {},
      {},
      providerMock('FINNHUB'),
      coinGecko,
      providerMock('EODHD'),
    );

    await expect(
      service.verifyProviderAsset('CRYPTO', 'COINGECKO', 'binancecoin'),
    ).resolves.toEqual(
      expect.objectContaining({ providerAssetId: 'binancecoin' }),
    );
    expect(coinGecko.getAssetById).toHaveBeenCalledWith('binancecoin');
    expect(coinGecko.search).not.toHaveBeenCalled();
  });

  it('returns a fresh cached EODHD quote without a provider request', async () => {
    const cache = {
      getJson: jest.fn().mockResolvedValue(eodQuote()),
    };
    const eodhd = providerMock('EODHD');
    const service = createService(
      {},
      cache,
      providerMock('FINNHUB'),
      providerMock('COINGECKO'),
      eodhd,
    );

    await expect(service.getPricesForSources([eodAsset()])).resolves.toEqual([
      expect.objectContaining({
        price: '510',
        priceType: 'EOD',
        providerDate: '2026-07-28',
        status: 'AVAILABLE',
      }),
    ]);
    expect(eodhd.getQuotes).not.toHaveBeenCalled();
  });

  it('returns a stale EODHD quote when refresh has no price', async () => {
    const cachedQuote = {
      ...eodQuote(),
      fetchedAt: '2026-07-26T00:00:00.000Z',
    };
    const cache = {
      getJson: jest.fn().mockResolvedValue(cachedQuote),
      setJson: jest.fn(),
    };
    const eodhd = providerMock('EODHD');
    const service = createService(
      {},
      cache,
      providerMock('FINNHUB'),
      providerMock('COINGECKO'),
      eodhd,
    );

    await expect(service.getPricesForSources([eodAsset()])).resolves.toEqual([
      expect.objectContaining({
        price: '510',
        status: 'STALE',
        priceType: 'EOD',
      }),
    ]);
  });

  it('returns owned EODHD history and refreshes the quote cache', async () => {
    const prisma = {
      asset: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'asset-1',
          provider: 'EODHD',
          providerAssetId: 'LUCK.KAR',
        }),
      },
    };
    const cache = {
      getJson: jest.fn().mockResolvedValue(null),
      setJson: jest.fn().mockResolvedValue(undefined),
    };
    const eodhd = providerMock('EODHD');
    eodhd.getHistory.mockResolvedValue({
      fetchedAt: new Date().toISOString(),
      bars: [
        {
          providerDate: '2026-07-28',
          open: '500',
          high: '515',
          low: '498',
          close: '510',
          adjustedClose: '509.5',
          volume: '1500',
        },
      ],
    });
    const service = createService(
      prisma,
      cache,
      providerMock('FINNHUB'),
      providerMock('COINGECKO'),
      eodhd,
    );

    const result = await service.getHistoryForUser(
      { id: 'user-1' } as never,
      'asset-1',
      '2026-07-01',
      '2026-07-28',
    );

    expect(result).toEqual(
      expect.objectContaining({
        provider: 'EODHD',
        status: 'AVAILABLE',
        bars: [expect.objectContaining({ close: '510' })],
      }),
    );
    expect(prisma.asset.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'asset-1', userId: 'user-1' },
      }),
    );
    expect(cache.setJson).toHaveBeenCalledTimes(2);
  });

  it('rejects unsupported history providers and ranges over one year', async () => {
    const prisma = {
      asset: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'asset-1',
            provider: 'FINNHUB',
            providerAssetId: 'AAPL',
          })
          .mockResolvedValueOnce({
            id: 'asset-2',
            provider: 'EODHD',
            providerAssetId: 'LUCK.KAR',
          }),
      },
    };
    const service = createService(
      prisma,
      {},
      providerMock('FINNHUB'),
      providerMock('COINGECKO'),
      providerMock('EODHD'),
    );

    await expect(
      service.getHistoryForUser({ id: 'user-1' } as never, 'asset-1'),
    ).rejects.toMatchObject({
      response: { error: { code: 'MARKET_HISTORY_UNSUPPORTED' } },
    });
    await expect(
      service.getHistoryForUser(
        { id: 'user-1' } as never,
        'asset-2',
        '2024-01-01',
        '2026-01-02',
      ),
    ).rejects.toMatchObject({
      response: { error: { code: 'INVALID_MARKET_HISTORY_RANGE' } },
    });
  });
});

function createService(
  prisma: object,
  cache: object,
  finnhub: ReturnType<typeof providerMock>,
  coinGecko: ReturnType<typeof providerMock>,
  eodhd: ReturnType<typeof providerMock>,
) {
  return new MarketDataService(
    prisma as never,
    cache as never,
    finnhub as never,
    coinGecko as never,
    eodhd as never,
  );
}

function providerMock(provider: 'FINNHUB' | 'COINGECKO' | 'EODHD') {
  return {
    provider,
    search: jest.fn().mockResolvedValue([]),
    getAssetById: jest.fn().mockResolvedValue(null),
    listSymbols: jest.fn().mockResolvedValue([]),
    getQuotes: jest.fn().mockResolvedValue(new Map()),
    getHistory: jest.fn().mockResolvedValue({ fetchedAt: '', bars: [] }),
  };
}

function eodAsset() {
  return {
    id: 'asset-1',
    provider: 'EODHD' as const,
    providerAssetId: 'LUCK.KAR',
    currentPrice: null,
    priceCurrency: 'PKR',
  };
}

function eodQuote() {
  return {
    providerAssetId: 'LUCK.KAR',
    price: '510',
    currency: 'PKR',
    priceType: 'EOD',
    providerDate: '2026-07-28',
    providerMarketAt: null,
    fetchedAt: new Date().toISOString(),
    open: '500',
    high: '515',
    low: '498',
    close: '510',
    adjustedClose: '509.5',
    change: '10',
    changePercent: '2',
    volume: '1500',
    bid: null,
    ask: null,
  };
}
