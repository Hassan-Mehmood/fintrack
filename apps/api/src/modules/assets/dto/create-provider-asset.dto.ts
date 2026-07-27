import { Transform } from 'class-transformer';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import {
  AssetMarketType,
  AssetProvider,
} from '../../../generated/prisma/enums';

export class CreateProviderAssetDto {
  @IsEnum(AssetProvider)
  provider!: AssetProvider;

  @IsEnum(AssetMarketType)
  type!: AssetMarketType;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  @Transform(({ value }: { value: unknown }): string =>
    typeof value === 'string' ? value.trim() : '',
  )
  providerAssetId!: string;
}
