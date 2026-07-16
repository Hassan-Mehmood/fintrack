import { Type } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { TradeType } from '../../../generated/prisma/enums';

const DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/;

export class InvestmentTransactionDetailDto {
  @IsUUID()
  assetId!: string;

  @IsEnum(TradeType)
  tradeType!: TradeType;

  @IsString()
  @Matches(DECIMAL_PATTERN)
  quantity!: string;

  @IsString()
  @Matches(DECIMAL_PATTERN)
  price!: string;

  @IsOptional()
  @IsString()
  @Matches(DECIMAL_PATTERN)
  fees?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  notes?: string;
}

export class OptionalInvestmentTransactionDetailDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => InvestmentTransactionDetailDto)
  investment?: InvestmentTransactionDetailDto;
}
