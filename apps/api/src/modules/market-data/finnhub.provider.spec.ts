import { FinnhubProvider } from './finnhub.provider';

describe('FinnhubProvider', () => {
  const previousKey = process.env.FINNHUB_API_KEY;

  afterAll(() => {
    process.env.FINNHUB_API_KEY = previousKey;
  });

  it('normalizes US symbol search results', async () => {
    process.env.FINNHUB_API_KEY = 'test-key';
    const http = {
      getJson: jest.fn().mockResolvedValue({
        result: [
          {
            description: 'APPLE INC',
            displaySymbol: 'AAPL',
            symbol: 'AAPL',
            type: 'Common Stock',
          },
        ],
      }),
    };
    const provider = new FinnhubProvider(http as never);

    await expect(provider.search('apple')).resolves.toEqual([
      expect.objectContaining({
        providerAssetId: 'AAPL',
        exchange: 'US',
        quoteCurrency: 'USD',
      }),
    ]);
  });

  it('omits unavailable zero-price quotes', async () => {
    process.env.FINNHUB_API_KEY = 'test-key';
    const http = { getJson: jest.fn().mockResolvedValue({ c: 0, t: 0 }) };
    const provider = new FinnhubProvider(http as never);

    await expect(provider.getQuotes(['UNKNOWN'])).resolves.toEqual(new Map());
  });
});
