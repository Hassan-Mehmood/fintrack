import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class SettlementAssetDto {
  @IsIn(['EXISTING', 'PROVIDER'])
  kind!: 'EXISTING' | 'PROVIDER';

  @IsOptional()
  @IsUUID()
  assetId?: string;

  @IsOptional()
  @IsIn(['COINGECKO'])
  provider?: 'COINGECKO';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  providerAssetId?: string;
}
