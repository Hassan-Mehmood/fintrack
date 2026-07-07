import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AccountType } from '../../../generated/prisma/enums';

const DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/;

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Transform(({ value }: { value: unknown }): string =>
    typeof value === 'string' ? value.trim() : '',
  )
  name?: string;

  @IsOptional()
  @IsEnum(AccountType)
  type?: AccountType;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/)
  @Transform(({ value }: { value: unknown }): string =>
    typeof value === 'string' ? value.trim().toUpperCase() : '',
  )
  currency?: string;

  @IsOptional()
  @IsString()
  @Matches(DECIMAL_PATTERN)
  openingBalance?: string;

  @IsOptional()
  @IsDateString()
  openedAt?: string;
}
