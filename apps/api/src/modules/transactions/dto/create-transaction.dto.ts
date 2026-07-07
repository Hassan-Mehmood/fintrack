import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
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

export class CreateTransactionDto {
  @IsEnum(TransactionType)
  type!: TransactionType;

  @IsUUID()
  accountId!: string;

  @IsOptional()
  @ValidateIf((dto: CreateTransactionDto) => dto.type === 'TRANSFER')
  @IsUUID()
  @Transform(({ value }: { value: unknown }): string | undefined =>
    typeof value === 'string' && value.trim() !== '' ? value : undefined,
  )
  destinationAccountId?: string;

  @IsString()
  @Matches(SIGNED_DECIMAL_PATTERN)
  amount!: string;

  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/)
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
  description!: string;

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
