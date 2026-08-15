import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AssetsService } from './assets.service';
import {
  createAssetCategoryNotFoundException,
  createAssetNotFoundException,
  createRiskProfileNotFoundException,
} from './assets.errors';

jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const authenticatedUser: AuthenticatedUser = {
  id: 'user-1',
  clerkId: 'clerk_123',
  email: 'user@example.com',
  name: 'Test User',
  baseCurrency: 'USD',
  exchangeRate: null,
  exchangeRateSource: 'MANUAL_SETTINGS',
  exchangeRateUpdatedAt: null,
};

describe('AssetsService', () => {
  let service: AssetsService;
  let prisma: {
    asset: {
      create: jest.Mock;
      delete: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
    assetCategory: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
    };
    riskProfile: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      asset: {
        create: jest.fn(),
        delete: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      assetCategory: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      riskProfile: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
    };

    service = new AssetsService(prisma as never);
  });

  it('lists asset categories ordered by name', async () => {
    prisma.assetCategory.findMany.mockResolvedValue([
      createCategoryRecord({ name: 'Crypto' }),
      createCategoryRecord({ name: 'Stock' }),
    ]);

    await expect(service.listAssetCategories()).resolves.toEqual([
      expect.objectContaining({ name: 'Crypto' }),
      expect.objectContaining({ name: 'Stock' }),
    ]);
  });

  it('lists risk profiles ordered by score', async () => {
    prisma.riskProfile.findMany.mockResolvedValue([
      createRiskProfileRecord({ name: 'Cash', score: 1 }),
      createRiskProfileRecord({ name: 'Crypto', score: 10 }),
    ]);

    await expect(service.listRiskProfiles()).resolves.toEqual([
      expect.objectContaining({ name: 'Cash', score: 1 }),
      expect.objectContaining({ name: 'Crypto', score: 10 }),
    ]);
  });

  it('lists user assets with category and risk labels', async () => {
    prisma.asset.findMany.mockResolvedValue([createAssetRecord()]);

    await expect(service.listAssetsForUser(authenticatedUser)).resolves.toEqual(
      [
        expect.objectContaining({
          id: 'asset-1',
          name: 'Bitcoin',
          symbol: 'BTC',
          categoryName: 'Crypto',
          riskProfileName: 'Aggressive',
          currentPrice: '67000',
        }),
      ],
    );
  });

  it('throws when the requested asset is not owned by the user', async () => {
    prisma.asset.findFirst.mockResolvedValue(null);

    await expect(
      service.getAssetForUser(authenticatedUser, 'missing-asset'),
    ).rejects.toEqual(createAssetNotFoundException('missing-asset'));
  });

  it('creates an asset after validating category and risk profile', async () => {
    prisma.assetCategory.findUnique.mockResolvedValue({ id: 'category-1' });
    prisma.riskProfile.findUnique.mockResolvedValue({ id: 'risk-1' });
    prisma.asset.create.mockResolvedValue(createAssetRecord());

    await expect(
      service.createAssetForUser(authenticatedUser, {
        name: 'Bitcoin',
        symbol: 'BTC',
        categoryId: 'category-1',
        riskProfileId: 'risk-1',
        currentPrice: '67000',
        priceCurrency: 'USD',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        name: 'Bitcoin',
        categoryName: 'Crypto',
      }),
    );

    expect(prisma.asset.create).toHaveBeenCalledTimes(1);
  });

  it('throws when creating an asset with an unknown category', async () => {
    prisma.assetCategory.findUnique.mockResolvedValue(null);

    await expect(
      service.createAssetForUser(authenticatedUser, {
        name: 'Bitcoin',
        categoryId: 'unknown-category',
      }),
    ).rejects.toEqual(createAssetCategoryNotFoundException('unknown-category'));
  });

  it('throws when creating an asset with an unknown risk profile', async () => {
    prisma.assetCategory.findUnique.mockResolvedValue({ id: 'category-1' });
    prisma.riskProfile.findUnique.mockResolvedValue(null);

    await expect(
      service.createAssetForUser(authenticatedUser, {
        name: 'Bitcoin',
        categoryId: 'category-1',
        riskProfileId: 'unknown-risk',
      }),
    ).rejects.toEqual(createRiskProfileNotFoundException('unknown-risk'));
  });

  it('updates an owned asset', async () => {
    prisma.asset.findFirst.mockResolvedValue({ id: 'asset-1' });
    prisma.assetCategory.findUnique.mockResolvedValue({ id: 'category-1' });
    prisma.asset.update.mockResolvedValue(
      createAssetRecord({ name: 'Updated Bitcoin' }),
    );

    await expect(
      service.updateAssetForUser(authenticatedUser, 'asset-1', {
        name: 'Updated Bitcoin',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        name: 'Updated Bitcoin',
      }),
    );
  });

  it('deletes an owned asset', async () => {
    prisma.asset.findFirst.mockResolvedValue({ id: 'asset-1' });

    await expect(
      service.deleteAssetForUser(authenticatedUser, 'asset-1'),
    ).resolves.toBeUndefined();

    expect(prisma.asset.delete).toHaveBeenCalledWith({
      where: {
        id: 'asset-1',
      },
    });
  });
});

function createAssetRecord({
  name = 'Bitcoin',
}: {
  readonly name?: string;
} = {}) {
  return {
    id: 'asset-1',
    name,
    symbol: 'BTC',
    categoryId: 'category-1',
    category: {
      name: 'Crypto',
    },
    riskProfileId: 'risk-1',
    riskProfile: {
      name: 'Aggressive',
    },
    currentPrice: {
      toString: () => '67000',
    },
    priceCurrency: 'USD',
    notes: null,
    createdAt: new Date('2026-06-20T10:00:00.000Z'),
    updatedAt: new Date('2026-06-21T10:00:00.000Z'),
  };
}

function createCategoryRecord({
  id = 'category-1',
  name = 'Crypto',
}: {
  readonly id?: string;
  readonly name?: string;
} = {}) {
  return {
    id,
    name,
    order: 0,
  };
}

function createRiskProfileRecord({
  id = 'risk-1',
  name = 'Aggressive',
  score = 10,
}: {
  readonly id?: string;
  readonly name?: string;
  readonly score?: number;
} = {}) {
  return {
    id,
    name,
    score,
    order: 0,
  };
}
