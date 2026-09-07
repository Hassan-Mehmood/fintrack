import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { WatchlistsService } from './watchlists.service';

jest.mock('../../prisma/prisma.service', () => ({ PrismaService: class {} }));

const user = { id: 'user-1' } as AuthenticatedUser;

describe('WatchlistsService', () => {
  it('lists named watchlists without changing financial records', async () => {
    const prisma = {
      watchlist: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'list-1',
            domain: 'SECURITIES',
            name: 'Ideas',
            displayOrder: 0,
            items: [{ assetId: 'asset-1' }],
            createdAt: new Date('2026-01-01'),
            updatedAt: new Date('2026-01-01'),
          },
        ]),
      },
    };
    const assets = {
      listAssetsForUser: jest
        .fn()
        .mockResolvedValue([
          { id: 'asset-1', name: 'Apple', currentPrice: '200' },
        ]),
    };
    const service = new WatchlistsService(prisma as never, assets as never);

    await expect(service.list(user)).resolves.toEqual([
      expect.objectContaining({
        id: 'list-1',
        name: 'Ideas',
        items: [expect.objectContaining({ id: 'asset-1' })],
      }),
    ]);
    expect(assets.listAssetsForUser).toHaveBeenCalledWith(user, undefined);
  });

  it('adds an owned asset to a watchlist independently of holdings', async () => {
    const prisma = {
      watchlist: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'list-1', domain: 'SECURITIES' }),
      },
      watchlistItem: { create: jest.fn().mockResolvedValue({}) },
    };
    const assets = {
      getAssetForUser: jest
        .fn()
        .mockResolvedValue({ id: 'asset-1', domain: 'SECURITIES' }),
    };
    const service = new WatchlistsService(prisma as never, assets as never);

    await expect(
      service.addItem(user, 'list-1', {
        kind: 'EXISTING',
        assetId: 'asset-1',
      }),
    ).resolves.toEqual({ watchlistId: 'list-1', assetId: 'asset-1' });
    expect(prisma.watchlistItem.create).toHaveBeenCalledWith({
      data: { watchlistId: 'list-1', assetId: 'asset-1' },
    });
  });
});
