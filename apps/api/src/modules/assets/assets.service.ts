import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';
import {
  createAssetCategoryNotFoundException,
  createAssetNotFoundException,
  createRiskProfileNotFoundException,
} from './assets.errors';
import type { CreateAssetDto } from './dto/create-asset.dto';
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
  constructor(private readonly prisma: PrismaService) {}

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

    return assets.map((asset) => this.toAssetResponse(asset));
  }

  async getAssetForUser(
    user: AuthenticatedUser,
    assetId: string,
  ): Promise<AssetResponse> {
    const asset = await this.findOwnedAssetOrThrow(user.id, assetId);

    return this.toAssetResponse(asset);
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

  async updateAssetForUser(
    user: AuthenticatedUser,
    assetId: string,
    payload: UpdateAssetDto,
  ): Promise<AssetResponse> {
    await this.findOwnedAssetOrThrow(user.id, assetId);

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

    return this.toAssetResponse(asset);
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

  private toAssetResponse(asset: AssetRecord): AssetResponse {
    return {
      id: asset.id,
      name: asset.name,
      symbol: asset.symbol ?? null,
      categoryId: asset.categoryId,
      categoryName: asset.category.name,
      riskProfileId: asset.riskProfileId,
      riskProfileName: asset.riskProfile?.name ?? null,
      currentPrice: asset.currentPrice?.toString() ?? null,
      priceCurrency: asset.priceCurrency,
      notes: asset.notes,
      createdAt: asset.createdAt.toISOString(),
      updatedAt: asset.updatedAt.toISOString(),
    };
  }
}
