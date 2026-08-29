import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import {
  TransactionStatus,
  TransactionType,
} from '../../../generated/prisma/enums';

const NON_NEGATIVE_DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/;

export const transactionSortValues = [
  'date',
  'amount',
  'description',
  'account',
  'category',
  'createdAt',
] as const;

export type TransactionSort = (typeof transactionSortValues)[number];

export class ListTransactionsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }: { value: unknown }): string | undefined =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined,
  )
  search?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  @Transform(({ value }: { value: unknown }): string[] => parseCsv(value))
  accountIds?: string[];

  @IsOptional()
  @IsArray()
  @IsEnum(TransactionType, { each: true })
  @Transform(({ value }: { value: unknown }): string[] => parseCsv(value))
  types?: TransactionType[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  @Transform(({ value }: { value: unknown }): string[] => parseCsv(value))
  categories?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  @Transform(({ value }: { value: unknown }): string[] => parseCsv(value))
  labels?: string[];

  @IsOptional()
  @IsArray()
  @IsEnum(TransactionStatus, { each: true })
  @Transform(({ value }: { value: unknown }): string[] => parseCsv(value))
  statuses?: TransactionStatus[];

  @IsOptional()
  @IsIn(['IN', 'OUT'])
  direction?: 'IN' | 'OUT';

  @IsOptional()
  @Matches(NON_NEGATIVE_DECIMAL_PATTERN)
  minAmount?: string;

  @IsOptional()
  @Matches(NON_NEGATIVE_DECIMAL_PATTERN)
  maxAmount?: string;

  @IsOptional()
  @IsArray()
  @IsIn(['USD', 'PKR'], { each: true })
  @Transform(({ value }: { value: unknown }): string[] => parseCsv(value))
  currencies?: string[];

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }: { value: unknown }): boolean | undefined =>
    parseBoolean(value),
  )
  hasNote?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }: { value: unknown }): boolean | undefined =>
    parseBoolean(value),
  )
  uncategorizedOnly?: boolean;

  @IsOptional()
  @IsIn(transactionSortValues)
  sortBy: TransactionSort = 'date';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDirection: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([25, 50, 100])
  pageSize = 25;
}

function parseCsv(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];

  return values
    .flatMap((entry) => (typeof entry === 'string' ? entry.split(',') : []))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseBoolean(value: unknown): boolean | undefined {
  if (value === true || value === 'true') {
    return true;
  }

  if (value === false || value === 'false') {
    return false;
  }

  return undefined;
}
