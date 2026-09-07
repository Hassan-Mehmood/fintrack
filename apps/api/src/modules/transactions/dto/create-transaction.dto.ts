import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { TransactionType } from '../../../generated/prisma/enums';
import { TransactionStatus } from '../../../generated/prisma/enums';
import { InvestmentTransactionDetailDto } from './investment-transaction-detail.dto';

const SIGNED_DECIMAL_PATTERN = /^(?:-)?(?:0|[1-9]\d*)(?:\.\d{1,8})?$/;
const CURRENCY_VALUES = ['USD', 'PKR'] as const;

export class CreateTransactionDto {
  @IsUUID()
  idempotencyKey?: string;

  @IsEnum(TransactionType)
  type!: TransactionType;

  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @IsUUID()
  accountId!: string;

  @IsOptional()
  @ValidateIf(
    (dto: CreateTransactionDto) =>
      dto.type === 'TRANSFER' || dto.type === 'INVESTMENT_TRANSFER',
  )
  @IsUUID()
  @Transform(({ value }: { value: unknown }): string | undefined =>
    typeof value === 'string' && value.trim() !== '' ? value : undefined,
  )
  destinationAccountId?: string;

  @ValidateIf(
    (dto: CreateTransactionDto) =>
      dto.amount !== undefined || requiresManualAmount(dto.type),
  )
  @IsString()
  @Matches(SIGNED_DECIMAL_PATTERN)
  amount?: string;

  @IsIn(CURRENCY_VALUES)
  @Transform(({ value }: { value: unknown }): string =>
    typeof value === 'string' ? value.trim().toUpperCase() : '',
  )
  currency!: string;

  @IsDateString()
  occurredAt!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Transform(({ value }: { value: unknown }): string =>
    typeof value === 'string' ? value.trim() : '',
  )
  category!: string;

  @IsString()
  @IsOptional()
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

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }: { value: unknown }): string =>
    typeof value === 'string' ? value.trim() : '',
  )
  reference?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  @Transform(({ value }: { value: unknown }): string[] | undefined =>
    normalizeLabels(value),
  )
  labels?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => InvestmentTransactionDetailDto)
  investment?: InvestmentTransactionDetailDto;
}

function normalizeLabels(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .filter((label): label is string => typeof label === 'string')
    .map((label) => label.trim())
    .filter(Boolean);
}

function requiresManualAmount(type: TransactionType): boolean {
  return (
    type === 'INCOME' ||
    type === 'EXPENSE' ||
    type === 'TRANSFER' ||
    type === 'REFUND' ||
    type === 'FEE' ||
    type === 'DIVIDEND' ||
    type === 'INTEREST' ||
    type === 'ADJUSTMENT'
  );
}
