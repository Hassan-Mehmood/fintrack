import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AssetMarketType } from '../../../generated/prisma/enums';

export class SearchMarketDataDto {
  @IsEnum(AssetMarketType)
  type!: AssetMarketType;

  @IsOptional()
  @IsIn(['US', 'PSX'])
  exchange?: 'US' | 'PSX';

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Transform(({ value }: { value: unknown }): string =>
    typeof value === 'string' ? value.trim() : '',
  )
  query!: string;
}
