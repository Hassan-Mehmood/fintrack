import { IsIn } from 'class-validator';
import type { InvestmentDomain } from '../types/finance-domain';

export class InvestmentDomainQueryDto {
  @IsIn(['SECURITIES', 'CRYPTO'])
  domain!: InvestmentDomain;
}
