import { IsIn, IsOptional } from 'class-validator';
import type { FinanceScope } from '../../../common/types/finance-domain';

export class ListAccountsQueryDto {
  @IsOptional()
  @IsIn(['MONEY', 'SECURITIES', 'CRYPTO'])
  scope?: FinanceScope;
}
