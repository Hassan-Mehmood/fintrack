import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { TransactionType } from '../../../generated/prisma/enums';

const SIGNED_DECIMAL_PATTERN = /^(?:-)?(?:0|[1-9]\d*)(?:\.\d{1,8})?$/;
const CURRENCY_VALUES = ['USD', 'PKR'] as const;

export class UpdateTransactionDto {
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @ValidateIf((dto: UpdateTransactionDto) => dto.type === 'TRANSFER')
  @IsUUID()
  @Transform(({ value }: { value: unknown }): string | undefined =>
    typeof value === 'string' && value.trim() !== '' ? value : undefined,
  )
  destinationAccountId?: string;

  @IsOptional()
  @IsString()
  @Matches(SIGNED_DECIMAL_PATTERN)
  amount?: string;

  @IsOptional()
  @IsIn(CURRENCY_VALUES)
  @Transform(({ value }: { value: unknown }): string =>
    typeof value === 'string' ? value.trim().toUpperCase() : '',
  )
  currency?: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Transform(({ value }: { value: unknown }): string =>
    typeof value === 'string' ? value.trim() : '',
  )
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }: { value: unknown }): string =>
    typeof value === 'string' ? value.trim() : '',
  )
  merchant?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(({ value }: { value: unknown }): string =>
    typeof value === 'string' ? value.trim() : '',
  )
  notes?: string;
}
