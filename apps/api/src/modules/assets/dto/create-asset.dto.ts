import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/;
const CURRENCY_VALUES = ['USD', 'PKR'] as const;

export class CreateAssetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Transform(({ value }: { value: unknown }): string =>
    typeof value === 'string' ? value.trim() : '',
  )
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Transform(({ value }: { value: unknown }): string | undefined =>
    typeof value === 'string' ? value.trim() : undefined,
  )
  symbol?: string;

  @IsUUID()
  categoryId!: string;

  @IsOptional()
  @IsUUID()
  riskProfileId?: string;

  @IsOptional()
  @IsString()
  @Matches(DECIMAL_PATTERN)
  currentPrice?: string;

  @IsOptional()
  @IsIn(CURRENCY_VALUES)
  @Transform(({ value }: { value: unknown }): string | undefined =>
    typeof value === 'string' ? value.trim().toUpperCase() : undefined,
  )
  priceCurrency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(({ value }: { value: unknown }): string | undefined =>
    typeof value === 'string' ? value.trim() : undefined,
  )
  notes?: string;

  @IsOptional()
  @IsIn(['INVESTMENT', 'CASH_EQUIVALENT'])
  liquidityClass?: 'INVESTMENT' | 'CASH_EQUIVALENT';
}
