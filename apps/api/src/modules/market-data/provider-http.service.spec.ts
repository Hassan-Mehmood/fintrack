import { ProviderHttpService } from './provider-http.service';

describe('ProviderHttpService', () => {
  const previousLimit = process.env.EODHD_REQUESTS_PER_DAY;

  afterEach(() => {
    jest.restoreAllMocks();
    process.env.EODHD_REQUESTS_PER_DAY = previousLimit;
  });

  it('enforces the configured EODHD daily Redis request budget', async () => {
    process.env.EODHD_REQUESTS_PER_DAY = '20';
    const cache = {
      incrementWithExpiry: jest.fn().mockResolvedValue(21),
    };
    const service = new ProviderHttpService(cache as never);
    const fetchSpy = jest.spyOn(global, 'fetch');

    await expect(
      service.getJson(
        'EODHD',
        new URL(
          'https://eodhd.test/api/eod/LUCK.KAR?api_token=hidden&fmt=json',
        ),
        {},
      ),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: 'MARKET_PROVIDER_RATE_LIMITED',
          details: { provider: 'EODHD' },
        },
      },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(cache.incrementWithExpiry).toHaveBeenCalledWith(
      expect.stringMatching(/^market-data:budget:EODHD:\d{4}-\d{2}-\d{2}$/),
      172_800,
    );
  });

  it('counts both EODHD attempts when retrying a temporary response', async () => {
    const cache = {
      incrementWithExpiry: jest
        .fn()
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2),
    };
    const service = new ProviderHttpService(cache as never);
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    await expect(
      service.getJson(
        'EODHD',
        new URL(
          'https://eodhd.test/api/eod/LUCK.KAR?api_token=hidden&fmt=json',
        ),
        {},
      ),
    ).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(cache.incrementWithExpiry).toHaveBeenCalledTimes(2);
  });

  it('maps an allowed 404 to a missing provider result', async () => {
    const service = new ProviderHttpService({
      incrementWithExpiry: jest.fn().mockResolvedValue(1),
    } as never);
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 404 }));

    await expect(
      service.getJson(
        'EODHD',
        new URL('https://eodhd.test/api/eod/UNKNOWN.KAR'),
        {},
        { notFoundAsNull: true },
      ),
    ).resolves.toBeNull();
  });
});
