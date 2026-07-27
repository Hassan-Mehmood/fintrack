import { Injectable, Optional } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';
import { MarketDataService } from '../market-data/market-data.service';
import type { AssetPrice } from '../market-data/market-data.types';
import {
  createAssetCategoryNotFoundException,
  createDuplicateProviderAssetException,
  createAssetNotFoundException,
  createProviderAssetLockedException,
  createRiskProfileNotFoundException,
} from './assets.errors';
import type { CreateAssetDto } from './dto/create-asset.dto';
import type { CreateProviderAssetDto } from './dto/create-provider-asset.dto';
import type { UpdateAssetDto } from './dto/update-asset.dto';
import type {
  AssetCategoryResponse,
  AssetResponse,
  RiskProfileResponse,
} from './assets.types';

const assetSelect = {
  id: true,
  name: true,
  symbol: true,
  provider: true,
  marketType: true,
  providerAssetId: true,
  exchange: true,
  imageUrl: true,
  categoryId: true,
  category: {
    select: {
      name: true,
    },
  },
  riskProfileId: true,
  riskProfile: {
    select: {
      name: true,
    },
  },
  currentPrice: true,
  priceCurrency: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AssetSelect;

type AssetRecord = Prisma.AssetGetPayload<{
  select: typeof assetSelect;
}>;

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly marketData?: MarketDataService,
  ) {}

  async listAssetCategories(): Promise<readonly AssetCategoryResponse[]> {
    const categories = await this.prisma.assetCategory.findMany({
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        order: true,
      },
    });

    return categories;
  }

  async listRiskProfiles(): Promise<readonly RiskProfileResponse[]> {
    const profiles = await this.prisma.riskProfile.findMany({
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        score: true,
        order: true,
      },
    });

    return profiles;
  }

  async listAssetsForUser(
    user: AuthenticatedUser,
  ): Promise<readonly AssetResponse[]> {
    const assets = await this.prisma.asset.findMany({
      where: {
        userId: user.id,
      },
      orderBy: [{ createdAt: 'desc' }],
      select: assetSelect,
    });

    const prices = this.marketData
      ? await this.marketData.getPricesForSources(assets)
      : [];
    const pricesByAsset = new Map(
      prices.map((price) => [price.assetId, price]),
    );

    return assets.map((asset) =>
      this.toAssetResponse(asset, pricesByAsset.get(asset.id)),
    );
  }

  async getAssetForUser(
    user: AuthenticatedUser,
    assetId: string,
  ): Promise<AssetResponse> {
    const asset = await this.findOwnedAssetOrThrow(user.id, assetId);

    const [price] = this.marketData
      ? await this.marketData.getPricesForSources([asset])
      : [];
    return this.toAssetResponse(asset, price);
  }

  async createAssetForUser(
    user: AuthenticatedUser,
    payload: CreateAssetDto,
  ): Promise<AssetResponse> {
    await this.validateAssetReferences(
      payload.categoryId,
      payload.riskProfileId,
    );

    const asset = await this.prisma.asset.create({
      data: {
        userId: user.id,
        name: payload.name,
        symbol: payload.symbol,
        categoryId: payload.categoryId,
        riskProfileId: payload.riskProfileId,
        currentPrice: payload.currentPrice,
        priceCurrency: payload.priceCurrency,
        notes: payload.notes,
      },
      select: assetSelect,
    });

    return this.toAssetResponse(asset);
  }

  async createProviderAssetForUser(
    user: AuthenticatedUser,
    payload: CreateProviderAssetDto,
  ): Promise<AssetResponse> {
    if (!this.marketData) {
      throw new Error('Market data service is unavailable.');
    }
    const candidate = await this.marketData.verifyProviderAsset(
      payload.type,
      payload.provider,
      payload.providerAssetId,
    );
    const [category, riskProfile] = await Promise.all([
      this.prisma.assetCategory.findUnique({
        where: { name: payload.type === 'STOCK' ? 'Stock' : 'Crypto' },
        select: { id: true },
      }),
      this.prisma.riskProfile.findUnique({
        where: { name: payload.type === 'STOCK' ? 'Stocks' : 'Crypto' },
        select: { id: true },
      }),
    ]);

    if (!category) {
      throw createAssetCategoryNotFoundException(payload.type);
    }

    try {
      const asset = await this.prisma.asset.create({
        data: {
          userId: user.id,
          name: candidate.name,
          symbol: candidate.symbol,
          provider: candidate.provider,
          marketType: candidate.type,
          providerAssetId: candidate.providerAssetId,
          exchange: candidate.exchange,
          imageUrl: candidate.imageUrl,
          categoryId: category.id,
          riskProfileId: riskProfile?.id,
          priceCurrency: candidate.quoteCurrency,
        },
        select: assetSelect,
      });

      const [price] = await this.marketData.getPricesForSources([asset]);
      return this.toAssetResponse(asset, price);
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw createDuplicateProviderAssetException();
      }
      throw error;
    }
  }

  async updateAssetForUser(
    user: AuthenticatedUser,
    assetId: string,
    payload: UpdateAssetDto,
  ): Promise<AssetResponse> {
    const existingAsset = await this.findOwnedAssetOrThrow(user.id, assetId);

    if (
      existingAsset.provider &&
      (payload.name !== undefined ||
        payload.symbol !== undefined ||
        payload.categoryId !== undefined ||
        payload.currentPrice !== undefined ||
        payload.priceCurrency !== undefined)
    ) {
      throw createProviderAssetLockedException();
    }

    if (
      payload.categoryId !== undefined ||
      payload.riskProfileId !== undefined
    ) {
      await this.validateAssetReferences(
        payload.categoryId,
        payload.riskProfileId,
      );
    }

    const asset = await this.prisma.asset.update({
      where: {
        id: assetId,
      },
      data: {
        name: payload.name,
        symbol: payload.symbol,
        categoryId: payload.categoryId,
        riskProfileId: payload.riskProfileId,
        currentPrice: payload.currentPrice,
        priceCurrency: payload.priceCurrency,
        notes: payload.notes,
      },
      select: assetSelect,
    });

    const [price] = this.marketData
      ? await this.marketData.getPricesForSources([asset])
      : [];
    return this.toAssetResponse(asset, price);
  }

  async deleteAssetForUser(
    user: AuthenticatedUser,
    assetId: string,
  ): Promise<void> {
    await this.findOwnedAssetOrThrow(user.id, assetId);

    await this.prisma.asset.delete({
      where: {
        id: assetId,
      },
    });
  }

  private async findOwnedAssetOrThrow(
    userId: string,
    assetId: string,
  ): Promise<AssetRecord> {
    const asset = await this.prisma.asset.findFirst({
      where: {
        id: assetId,
        userId,
      },
      select: assetSelect,
    });

    if (!asset) {
      throw createAssetNotFoundException(assetId);
    }

    return asset;
  }

  private async validateAssetReferences(
    categoryId?: string,
    riskProfileId?: string,
  ): Promise<void> {
    if (categoryId !== undefined) {
      const category = await this.prisma.assetCategory.findUnique({
        where: {
          id: categoryId,
        },
        select: {
          id: true,
        },
      });

      if (!category) {
        throw createAssetCategoryNotFoundException(categoryId);
      }
    }

    if (riskProfileId !== undefined) {
      const riskProfile = await this.prisma.riskProfile.findUnique({
        where: {
          id: riskProfileId,
        },
        select: {
          id: true,
        },
      });

      if (!riskProfile) {
        throw createRiskProfileNotFoundException(riskProfileId);
      }
    }
  }

  private toAssetResponse(
    asset: AssetRecord,
    price?: AssetPrice,
  ): AssetResponse {
    return {
      id: asset.id,
      name: asset.name,
      symbol: asset.symbol ?? null,
      provider: asset.provider,
      marketType: asset.marketType,
      providerAssetId: asset.providerAssetId,
      exchange: asset.exchange,
      imageUrl: asset.imageUrl,
      categoryId: asset.categoryId,
      categoryName: asset.category.name,
      riskProfileId: asset.riskProfileId,
      riskProfileName: asset.riskProfile?.name ?? null,
      currentPrice: price?.price ?? asset.currentPrice?.toString() ?? null,
      priceCurrency: price?.currency ?? asset.priceCurrency,
      priceStatus:
        price?.status ?? (asset.currentPrice ? 'AVAILABLE' : 'UNAVAILABLE'),
      priceUpdatedAt: price?.fetchedAt ?? null,
      providerMarketAt: price?.providerMarketAt ?? null,
      priceChangePercent: price?.changePercent ?? null,
      notes: asset.notes,
      createdAt: asset.createdAt.toISOString(),
      updatedAt: asset.updatedAt.toISOString(),
    };
  }
}
