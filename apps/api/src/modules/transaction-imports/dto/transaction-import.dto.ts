import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const decimalPattern = /^(?:-)?(?:0|[1-9]\d*)(?:\.\d{1,8})?$/;

export class TransactionImportMappingDto {
  @IsString() @MaxLength(120) sourceAccountKey!: string;
  @IsUUID() accountId!: string;
}

export class TransactionImportResolutionDto {
  @IsString() @MaxLength(64) itemId!: string;
  @IsString()
  @Matches(/^(SKIP|INCOME|EXPENSE|ADJUSTMENT)$/)
  resolution!: string;
}

export class TransactionImportReconciliationDto {
  @IsUUID() accountId!: string;
  @IsString() @Matches(decimalPattern) expectedCurrentBalance!: string;
  @IsString() @Matches(decimalPattern) externalBalance!: string;
  @IsDateString() occurredAt!: string;
  @IsBoolean() includeAdjustment!: boolean;
}

export class PreviewTransactionImportDto {
  @IsString() @MaxLength(255) fileName!: string;
  @IsString() @MaxLength(1_000_000) csvText!: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TransactionImportMappingDto)
  mappings?: TransactionImportMappingDto[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10_000)
  @IsString({ each: true })
  selectedItemIds?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10_000)
  @ValidateNested({ each: true })
  @Type(() => TransactionImportResolutionDto)
  resolutions?: TransactionImportResolutionDto[];
}

export class CommitTransactionImportDto extends PreviewTransactionImportDto {
  @IsUUID() idempotencyKey!: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TransactionImportReconciliationDto)
  reconciliations?: TransactionImportReconciliationDto[];
}
