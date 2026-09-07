import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import type { HoldingGroupBy, ReportingCurrency } from '../investments.types';

function uppercase(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

export class InvestmentReportQueryDto {
  @IsIn(['SECURITIES', 'CRYPTO'])
  domain!: 'SECURITIES' | 'CRYPTO';

  @IsOptional()
  @IsIn(['USD', 'PKR', 'NATIVE'])
  @Transform(({ value }: { value: unknown }): string => uppercase(value))
  reportingCurrency: ReportingCurrency = 'USD';

  @IsOptional()
  @IsIn(['NONE', 'ACCOUNT', 'PORTFOLIO', 'ASSET_TYPE', 'CURRENCY'])
  @Transform(({ value }: { value: unknown }): string => uppercase(value))
  groupBy: HoldingGroupBy = 'NONE';

  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @IsUUID()
  portfolioId?: string;

  @IsOptional()
  @IsString()
  assetType?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  @Transform(({ value }: { value: unknown }): string => uppercase(value))
  currency?: string;
}
