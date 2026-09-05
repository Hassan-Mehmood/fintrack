import { IsIn, IsString, IsUUID, Matches } from 'class-validator';

// NUMERIC(24, 8): at most sixteen integer digits and eight fractional digits.
const BALANCE_PATTERN = /^-?(?:0|[1-9]\d{0,15})(?:\.\d{1,8})?$/;

export class AdjustAccountBalanceDto {
  @IsString()
  @Matches(BALANCE_PATTERN)
  currentBalance!: string;

  @IsString()
  @Matches(BALANCE_PATTERN)
  expectedBalance!: string;

  @IsIn(['USD', 'PKR'])
  currency!: string;

  @IsUUID()
  idempotencyKey!: string;
}
