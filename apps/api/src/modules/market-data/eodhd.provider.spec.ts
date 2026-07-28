import { EodhdProvider } from './eodhd.provider';

describe('EodhdProvider', () => {
  const previousToken = process.env.EODHD_API_TOKEN;
  const previousBaseUrl = process.env.EODHD_BASE_URL;

  beforeEach(() => {
    process.env.EODHD_API_TOKEN = 'eodhd-test-token';
    process.env.EODHD_BASE_URL = 'https://eodhd.test/api';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env.EODHD_API_TOKEN = previousToken;
    process.env.EODHD_BASE_URL = previousBaseUrl;
  });

  it('caches and locally filters supported KAR stocks and ETFs', async () => {
    const http = {
      getJson: jest.fn().mockResolvedValue([
        {
          Code: 'LUCK',
          Name: 'Lucky Cement Limited',
          Exchange: 'KAR',
          Currency: 'PKR',
          Type: 'Common Stock',
        },
        {
          Code: 'MZNPETF',
          Name: 'Meezan Pakistan ETF',
          Exchange: 'KAR',
          Currency: 'PKR',
          Type: 'ETF',
        },
        {
          Code: 'PREF',
          Name: 'Preferred Example Limited',
          Exchange: 'KAR',
          Currency: 'PKR',
          Type: 'Preferred Stock',
        },
        {
          Code: 'KSE100',
          Name: 'KSE 100 Index',
          Exchange: 'KAR',
          Currency: 'PKR',
          Type: 'Index',
        },
      ]),
    };
    const cache = emptyCache();
    const provider = new EodhdProvider(http as never, cache as never);

    await expect(provider.search('lucky')).resolves.toEqual([
      expect.objectContaining({
        provider: 'EODHD',
        providerAssetId: 'LUCK.KAR',
        symbol: 'LUCK',
        exchange: 'PSX',
        quoteCurrency: 'PKR',
      }),
    ]);
    await expect(provider.listSymbols()).resolves.toHaveLength(3);
    const httpCalls = http.getJson.mock.calls as unknown as ReadonlyArray<
      readonly [string, URL]
    >;
    const requestUrl = httpCalls[0][1];
    expect(requestUrl.origin + requestUrl.pathname).toBe(
      'https://eodhd.test/api/exchange-symbol-list/KAR',
    );
    expect(requestUrl.searchParams.get('api_token')).toBe('eodhd-test-token');
    expect(requestUrl.searchParams.get('fmt')).toBe('json');
    const cacheCalls = cache.setJson.mock.calls as unknown as ReadonlyArray<
      readonly [
        string,
        { readonly assets: readonly unknown[]; readonly fetchedAt: string },
        number,
      ]
    >;
    expect(cacheCalls[0][0]).toBe('market-data:catalog:EODHD:PSX');
    expect(cacheCalls[0][1].assets).toHaveLength(3);
    expect(cacheCalls[0][2]).toBe(2_592_000);
  });

  it('uses a stale catalog when refresh fails', async () => {
    const stale = {
      fetchedAt: '2020-01-01T00:00:00.000Z',
      assets: [
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
      ],
    };
    const provider = new EodhdProvider(
      { getJson: jest.fn().mockRejectedValue(new Error('timeout')) } as never,
      {
        getJson: jest.fn().mockResolvedValue(stale),
        setJson: jest.fn(),
      } as never,
    );

    await expect(provider.listSymbols()).resolves.toEqual(stale.assets);
  });

  it('normalizes latest EOD OHLCV and derives change from two closes', async () => {
    const http = {
      getJson: jest.fn().mockResolvedValue([
        {
          date: '2026-07-27',
          open: 490,
          high: 505,
          low: 488,
          close: 500,
          adjusted_close: 499.5,
          volume: 1200,
        },
        {
          date: '2026-07-28',
          open: 500,
          high: 515,
          low: 498,
          close: 510,
          adjusted_close: 509.5,
          volume: 1500,
        },
      ]),
    };
    const provider = new EodhdProvider(http as never, emptyCache() as never);
    const quotes = await provider.getQuotes(['luck', 'LUCK.KAR']);
    const quote = quotes.get('LUCK.KAR');

    expect(quote).toEqual(
      expect.objectContaining({
        price: '510',
        currency: 'PKR',
        priceType: 'EOD',
        providerDate: '2026-07-28',
        open: '500',
        high: '515',
        low: '498',
        close: '510',
        adjustedClose: '509.5',
        volume: '1500',
        change: '10',
        changePercent: '2',
        bid: null,
        ask: null,
      }),
    );
    expect(http.getJson).toHaveBeenCalledTimes(1);
  });

  it('returns no quote for invalid or missing price rows', async () => {
    const provider = new EodhdProvider(
      { getJson: jest.fn().mockResolvedValue([]) } as never,
      emptyCache() as never,
    );

    await expect(provider.getQuotes(['UNKNOWN.KAR'])).resolves.toEqual(
      new Map(),
    );
  });

  it('limits concurrent EOD requests to three symbols', async () => {
    let activeRequests = 0;
    let maximumActiveRequests = 0;
    const http = {
      getJson: jest.fn().mockImplementation(async () => {
        activeRequests += 1;
        maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
        await new Promise((resolve) => setTimeout(resolve, 5));
        activeRequests -= 1;
        return [
          {
            date: '2026-07-28',
            open: 10,
            high: 12,
            low: 9,
            close: 11,
            adjusted_close: 11,
            volume: 100,
          },
        ];
      }),
    };
    const provider = new EodhdProvider(http as never, emptyCache() as never);

    const quotes = await provider.getQuotes([
      'AAA.KAR',
      'BBB.KAR',
      'CCC.KAR',
      'DDD.KAR',
    ]);

    expect(quotes.size).toBe(4);
    expect(maximumActiveRequests).toBe(3);
  });

  it('rejects malformed history payloads with a safe provider error', async () => {
    const provider = new EodhdProvider(
      {
        getJson: jest
          .fn()
          .mockResolvedValue({ token: 'must-not-appear-in-error' }),
      } as never,
      emptyCache() as never,
    );

    await expect(
      provider.getHistory('LUCK.KAR', '2026-07-01', '2026-07-28'),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: 'MARKET_PROVIDER_FAILURE',
          details: { provider: 'EODHD' },
        },
      },
    });
  });
});

function emptyCache() {
  return {
    getJson: jest.fn().mockResolvedValue(null),
    setJson: jest.fn().mockResolvedValue(undefined),
  };
}
