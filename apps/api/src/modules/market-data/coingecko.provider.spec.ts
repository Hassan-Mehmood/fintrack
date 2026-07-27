import { CoinGeckoProvider } from './coingecko.provider';

describe('CoinGeckoProvider', () => {
  const previousKey = process.env.COINGECKO_API_KEY;

  afterAll(() => {
    process.env.COINGECKO_API_KEY = previousKey;
  });

  it('normalizes coin search results using the stable CoinGecko id', async () => {
    process.env.COINGECKO_API_KEY = 'test-key';
    const http = {
      getJson: jest.fn().mockResolvedValue({
        coins: [
          {
            id: 'bitcoin',
            name: 'Bitcoin',
            symbol: 'btc',
            thumb: 'https://example.test/bitcoin.png',
          },
        ],
      }),
    };
    const provider = new CoinGeckoProvider(http as never);

    await expect(provider.search('btc')).resolves.toEqual([
      expect.objectContaining({
        providerAssetId: 'bitcoin',
        symbol: 'BTC',
        provider: 'COINGECKO',
      }),
    ]);
  });

  it('normalizes batched prices and timestamps', async () => {
    process.env.COINGECKO_API_KEY = 'test-key';
    const http = {
      getJson: jest.fn().mockResolvedValue({
        bitcoin: {
          usd: 70000.12345678,
          usd_24h_change: 2.5,
          last_updated_at: 1_700_000_000,
        },
      }),
    };
    const provider = new CoinGeckoProvider(http as never);
    const quotes = await provider.getQuotes(['bitcoin', 'missing']);

    expect(quotes.get('bitcoin')).toEqual(
      expect.objectContaining({
        price: '70000.12345678',
        changePercent: '2.5',
      }),
    );
    expect(quotes.has('missing')).toBe(false);
  });
});
