import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { SettlementAssetDto } from './settlement-asset.dto';

const DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/;

export class PositionAssetDto {
  @IsIn(['EXISTING', 'PROVIDER', 'MANUAL'])
  kind!: 'EXISTING' | 'PROVIDER' | 'MANUAL';

  @IsOptional() @IsUUID() assetId?: string;
  @IsOptional() @IsIn(['STOCK', 'CRYPTO']) type?: 'STOCK' | 'CRYPTO';
  @IsOptional() @IsIn(['FINNHUB', 'COINGECKO', 'EODHD']) provider?:
    'FINNHUB' | 'COINGECKO' | 'EODHD';
  @IsOptional() @IsString() @MaxLength(255) providerAssetId?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(20) symbol?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() riskProfileId?: string;
  @IsOptional() @IsString() @Matches(DECIMAL_PATTERN) currentPrice?: string;
  @IsOptional() @IsIn(['USD', 'PKR']) priceCurrency?: 'USD' | 'PKR';
  @IsOptional() @IsIn(['INVESTMENT', 'CASH_EQUIVALENT']) liquidityClass?:
    'INVESTMENT' | 'CASH_EQUIVALENT';
}

export class PositionAccountDto {
  @IsIn(['EXISTING', 'NEW'])
  kind!: 'EXISTING' | 'NEW';
  @IsOptional() @IsUUID() accountId?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsIn(['USD', 'PKR']) currency?: 'USD' | 'PKR';
  @IsOptional() @IsString() @Matches(DECIMAL_PATTERN) openingBalance?: string;
}

export class PositionPortfolioDto {
  @IsIn(['EXISTING', 'NEW'])
  kind!: 'EXISTING' | 'NEW';
  @IsOptional() @IsUUID() portfolioId?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
}

export class CreatePositionDto {
  @IsIn(['SECURITIES', 'CRYPTO'])
  domain!: 'SECURITIES' | 'CRYPTO';

  @IsUUID()
  idempotencyKey!: string;

  @IsIn(['OPENING', 'BUY'])
  mode!: 'OPENING' | 'BUY';

  @ValidateNested()
  @Type(() => PositionAssetDto)
  asset!: PositionAssetDto;

  @ValidateNested()
  @Type(() => PositionAccountDto)
  account!: PositionAccountDto;

  @IsString()
  @Matches(DECIMAL_PATTERN)
  quantity!: string;

  @IsIn(['UNIT', 'TOTAL'])
  costInput!: 'UNIT' | 'TOTAL';

  @IsOptional() @IsString() @Matches(DECIMAL_PATTERN) unitCost?: string;
  @IsOptional() @IsString() @Matches(DECIMAL_PATTERN) totalCost?: string;
  @IsOptional() @IsString() @Matches(DECIMAL_PATTERN) unitPrice?: string;
  @IsOptional() @IsString() @Matches(DECIMAL_PATTERN) fees?: string;
  @IsOptional() @IsString() @Matches(DECIMAL_PATTERN) historicalFxRate?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SettlementAssetDto)
  settlementAsset?: SettlementAssetDto;

  @IsDateString()
  occurredAt!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PositionPortfolioDto)
  portfolio?: PositionPortfolioDto;
}
