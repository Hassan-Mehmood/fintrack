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
import { SettlementAssetDto } from '../../investments/dto/settlement-asset.dto';

const DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/;

export class InvestmentTransactionDetailDto {
  @IsUUID()
  assetId!: string;

  @IsEnum(TradeType)
  tradeType!: TradeType;

  @IsOptional()
  @IsString()
  @Matches(DECIMAL_PATTERN)
  quantity?: string;

  @IsOptional()
  @IsString()
  @Matches(DECIMAL_PATTERN)
  price?: string;

  @IsOptional()
  @IsString()
  @Matches(DECIMAL_PATTERN)
  fees?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SettlementAssetDto)
  settlementAsset?: SettlementAssetDto;
}

export class OptionalInvestmentTransactionDetailDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => InvestmentTransactionDetailDto)
  investment?: InvestmentTransactionDetailDto;
}
