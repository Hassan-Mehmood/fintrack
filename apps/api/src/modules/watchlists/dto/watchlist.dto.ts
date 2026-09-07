import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class WatchlistNameDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;
}

export class AddWatchlistItemDto {
  @IsIn(['EXISTING', 'PROVIDER', 'MANUAL'])
  kind!: 'EXISTING' | 'PROVIDER' | 'MANUAL';
  @IsOptional() @IsUUID() assetId?: string;
  @IsOptional() @IsIn(['STOCK', 'CRYPTO']) type?: 'STOCK' | 'CRYPTO';
  @IsOptional() @IsIn(['FINNHUB', 'COINGECKO', 'EODHD']) provider?:
    'FINNHUB' | 'COINGECKO' | 'EODHD';
  @IsOptional() @IsString() providerAssetId?: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(20) symbol?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() riskProfileId?: string;
  @IsOptional() @IsString() currentPrice?: string;
  @IsOptional() @IsIn(['USD', 'PKR']) priceCurrency?: 'USD' | 'PKR';
}
