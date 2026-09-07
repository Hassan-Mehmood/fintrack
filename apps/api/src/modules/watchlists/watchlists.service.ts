import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AssetsService } from '../assets/assets.service';
import type {
  AddWatchlistItemDto,
  WatchlistNameDto,
} from './dto/watchlist.dto';

@Injectable()
export class WatchlistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assets: AssetsService,
  ) {}

  async list(user: AuthenticatedUser, domain?: 'SECURITIES' | 'CRYPTO') {
    const lists = await this.prisma.watchlist.findMany({
      where: { userId: user.id, domain },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        items: { orderBy: { createdAt: 'asc' }, select: { assetId: true } },
      },
    });
    const pricedAssets = new Map(
      (await this.assets.listAssetsForUser(user, domain)).map((asset) => [
        asset.id,
        asset,
      ]),
    );
    return lists.map((list) => ({
      id: list.id,
      domain: list.domain,
      name: list.name,
      displayOrder: list.displayOrder,
      items: list.items.flatMap(({ assetId }) => {
        const asset = pricedAssets.get(assetId);
        return asset ? [asset] : [];
      }),
      createdAt: list.createdAt.toISOString(),
      updatedAt: list.updatedAt.toISOString(),
    }));
  }

  async create(user: AuthenticatedUser, payload: WatchlistNameDto) {
    if (!payload.domain)
      throw new BadRequestException('Investment domain is required.');
    try {
      return await this.prisma.watchlist.create({
        data: {
          userId: user.id,
          name: payload.name.trim(),
          domain: payload.domain,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'A watchlist with this name already exists.',
        );
      throw error;
    }
  }

  async rename(user: AuthenticatedUser, id: string, payload: WatchlistNameDto) {
    await this.owned(user.id, id);
    return this.prisma.watchlist.update({
      where: { id },
      data: { name: payload.name.trim() },
    });
  }

  async remove(user: AuthenticatedUser, id: string) {
    await this.owned(user.id, id);
    await this.prisma.watchlist.delete({ where: { id } });
  }

  async addItem(
    user: AuthenticatedUser,
    id: string,
    payload: AddWatchlistItemDto,
  ) {
    const list = await this.owned(user.id, id);
    let assetId: string;
    if (payload.kind === 'EXISTING') {
      if (!payload.assetId) throw new BadRequestException('Select an asset.');
      assetId = (await this.assets.getAssetForUser(user, payload.assetId)).id;
    } else if (payload.kind === 'PROVIDER') {
      if (!payload.type || !payload.provider || !payload.providerAssetId)
        throw new BadRequestException('Provider asset details are incomplete.');
      const providerDomain =
        payload.type === 'CRYPTO' ? 'CRYPTO' : 'SECURITIES';
      if (providerDomain !== list.domain)
        throw new BadRequestException(
          'Asset belongs to another investment domain.',
        );
      const existing = (await this.assets.listAssetsForUser(user)).find(
        (asset) =>
          asset.provider === payload.provider &&
          asset.providerAssetId === payload.providerAssetId,
      );
      assetId =
        existing?.id ??
        (
          await this.assets.createProviderAssetForUser(user, {
            type: payload.type,
            provider: payload.provider,
            providerAssetId: payload.providerAssetId,
          })
        ).id;
    } else {
      if (!payload.name || !payload.categoryId || !payload.priceCurrency)
        throw new BadRequestException('Manual asset details are incomplete.');
      assetId = (
        await this.assets.createAssetForUser(user, {
          domain: list.domain,
          name: payload.name,
          symbol: payload.symbol,
          categoryId: payload.categoryId,
          riskProfileId: payload.riskProfileId,
          currentPrice: payload.currentPrice,
          priceCurrency: payload.priceCurrency,
        })
      ).id;
    }
    const selectedAsset = await this.assets.getAssetForUser(user, assetId);
    if (selectedAsset.domain !== list.domain)
      throw new BadRequestException(
        'Asset belongs to another investment domain.',
      );
    try {
      await this.prisma.watchlistItem.create({
        data: { watchlistId: id, assetId },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('Asset is already in this watchlist.');
      throw error;
    }
    return { watchlistId: id, assetId };
  }

  async removeItem(user: AuthenticatedUser, id: string, assetId: string) {
    await this.owned(user.id, id);
    const deleted = await this.prisma.watchlistItem.deleteMany({
      where: { watchlistId: id, assetId, asset: { userId: user.id } },
    });
    if (!deleted.count)
      throw new NotFoundException('Watchlist item not found.');
  }

  private async owned(userId: string, id: string) {
    const list = await this.prisma.watchlist.findFirst({
      where: { id, userId },
      select: { id: true, domain: true },
    });
    if (!list) throw new NotFoundException('Watchlist not found.');
    return list;
  }
}
