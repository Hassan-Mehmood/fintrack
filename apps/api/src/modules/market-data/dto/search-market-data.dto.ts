import { Transform } from 'class-transformer';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { AssetMarketType } from '../../../generated/prisma/enums';

export class SearchMarketDataDto {
  @IsEnum(AssetMarketType)
  type!: AssetMarketType;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Transform(({ value }: { value: unknown }): string =>
    typeof value === 'string' ? value.trim() : '',
  )
  query!: string;
}
