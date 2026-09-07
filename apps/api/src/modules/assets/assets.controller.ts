import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { InvestmentDomainQueryDto } from '../../common/dto/investment-domain-query.dto';
import { AssetsService } from './assets.service';
import type {
  AssetItemResponse,
  AssetMetadataResponse,
  AssetsListResponse,
  DeleteAssetResponse,
} from './assets.types';
import { CreateAssetDto } from './dto/create-asset.dto';
import { CreateProviderAssetDto } from './dto/create-provider-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';

@Controller('api/v1/assets')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Get('metadata')
  async getMetadata(): Promise<AssetMetadataResponse> {
    const [categories, riskProfiles] = await Promise.all([
      this.assetsService.listAssetCategories(),
      this.assetsService.listRiskProfiles(),
    ]);

    return {
      data: {
        categories,
        riskProfiles,
      },
    };
  }

  @Get()
  async listAssets(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: InvestmentDomainQueryDto,
  ): Promise<AssetsListResponse> {
    const assets = await this.assetsService.listAssetsForUser(
      user,
      query.domain,
    );

    return {
      data: assets,
      meta: {
        total: assets.length,
      },
    };
  }

  @Get(':assetId')
  async getAsset(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
  ): Promise<AssetItemResponse> {
    return {
      data: await this.assetsService.getAssetForUser(user, assetId),
    };
  }

  @Post()
  async createAsset(
    @CurrentUser() user: AuthenticatedUser,
    @Body() payload: CreateAssetDto,
  ): Promise<AssetItemResponse> {
    return {
      data: await this.assetsService.createAssetForUser(user, payload),
    };
  }

  @Post('from-provider')
  async createProviderAsset(
    @CurrentUser() user: AuthenticatedUser,
    @Body() payload: CreateProviderAssetDto,
  ): Promise<AssetItemResponse> {
    return {
      data: await this.assetsService.createProviderAssetForUser(user, payload),
    };
  }

  @Patch(':assetId')
  async updateAsset(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Body() payload: UpdateAssetDto,
  ): Promise<AssetItemResponse> {
    return {
      data: await this.assetsService.updateAssetForUser(user, assetId, payload),
    };
  }

  @Delete(':assetId')
  async deleteAsset(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
  ): Promise<DeleteAssetResponse> {
    await this.assetsService.deleteAssetForUser(user, assetId);

    return {
      data: {
        id: assetId,
        deleted: true,
      },
    };
  }
}
