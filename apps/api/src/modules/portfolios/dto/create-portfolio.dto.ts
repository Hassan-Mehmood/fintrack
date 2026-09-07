import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  IsNumberString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class PortfolioHoldingDto {
  @IsUUID()
  accountId!: string;

  @IsUUID()
  assetId!: string;
}

export class PortfolioCashAllocationDto {
  @IsUUID()
  accountId!: string;

  @IsNumberString()
  percentage!: string;
}

export class CreatePortfolioDto {
  @IsIn(['SECURITIES', 'CRYPTO'])
  domain!: 'SECURITIES' | 'CRYPTO';

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Transform(({ value }: { value: unknown }): string =>
    typeof value === 'string' ? value.trim() : '',
  )
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }: { value: unknown }): string | undefined => {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  })
  description?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  accountIds?: readonly string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PortfolioHoldingDto)
  holdings?: readonly PortfolioHoldingDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PortfolioCashAllocationDto)
  cashAllocations?: readonly PortfolioCashAllocationDto[];
}
