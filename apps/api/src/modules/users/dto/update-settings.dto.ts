import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

const DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/;

export class UpdateSettingsDto {
  @IsOptional()
  @IsIn(['USD', 'PKR'])
  @Transform(({ value }: { value: unknown }): string =>
    typeof value === 'string' ? value.trim().toUpperCase() : '',
  )
  baseCurrency?: string;

  @IsOptional()
  @IsString()
  @Matches(DECIMAL_PATTERN)
  exchangeRate?: string;
}
