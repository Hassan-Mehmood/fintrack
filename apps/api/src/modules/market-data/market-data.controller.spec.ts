import { MarketDataController } from './market-data.controller';

describe('MarketDataController', () => {
  it('returns normalized PSX symbols with total metadata', async () => {
    const service = serviceMock();
    service.listSymbols.mockResolvedValue([
      { provider: 'EODHD', providerAssetId: 'LUCK.KAR' },
    ]);
    const controller = new MarketDataController(service as never);

    await expect(controller.symbols({ exchange: 'PSX' })).resolves.toEqual({
      data: [{ provider: 'EODHD', providerAssetId: 'LUCK.KAR' }],
      meta: { total: 1 },
    });
    expect(service.listSymbols).toHaveBeenCalledWith('PSX');
  });

  it('passes the authenticated user and validated range to history lookup', async () => {
    const service = serviceMock();
    service.getHistoryForUser.mockResolvedValue({
      assetId: '3c456db5-ab61-4fac-aec5-2cce6857a200',
      provider: 'EODHD',
      providerAssetId: 'LUCK.KAR',
      currency: 'PKR',
      priceType: 'EOD',
      fetchedAt: '2026-07-28T12:00:00.000Z',
      status: 'AVAILABLE',
      bars: [{ providerDate: '2026-07-28', close: '510' }],
    });
    const controller = new MarketDataController(service as never);
    const user = { id: 'user-1' } as never;

    await expect(
      controller.history(user, '3c456db5-ab61-4fac-aec5-2cce6857a200', {
        from: '2026-07-01',
        to: '2026-07-28',
      }),
    ).resolves.toEqual(expect.objectContaining({ meta: { total: 1 } }));
    expect(service.getHistoryForUser).toHaveBeenCalledWith(
      user,
      '3c456db5-ab61-4fac-aec5-2cce6857a200',
      '2026-07-01',
      '2026-07-28',
    );
  });
});

function serviceMock() {
  return {
    search: jest.fn(),
    listSymbols: jest.fn(),
    getHistoryForUser: jest.fn(),
    getPricesForUser: jest.fn(),
  };
}
