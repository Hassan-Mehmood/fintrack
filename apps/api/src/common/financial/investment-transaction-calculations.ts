import { Prisma } from '../../generated/prisma/client';
import type { TransactionType } from '../../generated/prisma/enums';

const Decimal = Prisma.Decimal;

export interface InvestmentCalculationInput {
  readonly type: TransactionType;
  readonly quantity: Prisma.Decimal;
  readonly price: Prisma.Decimal;
  readonly fees: Prisma.Decimal;
}

export interface InvestmentCalculationResult {
  readonly grossAmount: Prisma.Decimal;
  readonly cashImpact: Prisma.Decimal;
}

export function calculateInvestmentTransactionAmounts(
  input: InvestmentCalculationInput,
): InvestmentCalculationResult {
  const grossAmount = input.quantity
    .times(input.price)
    .toDecimalPlaces(8, Decimal.ROUND_HALF_UP);

  switch (input.type) {
    case 'INVESTMENT_BUY':
    case 'INVESTMENT_REINVESTMENT':
      return {
        grossAmount,
        cashImpact: grossAmount.add(input.fees),
      };
    case 'INVESTMENT_SELL':
      return {
        grossAmount,
        cashImpact: grossAmount.sub(input.fees),
      };
    case 'DIVIDEND':
    case 'INTEREST':
    case 'INVESTMENT_SPLIT':
    case 'INVESTMENT_BONUS':
    case 'INVESTMENT_DEPOSIT':
    case 'INVESTMENT_WITHDRAWAL':
      return {
        grossAmount: new Decimal(0),
        cashImpact: new Decimal(0),
      };
    default:
      throw new Error(
        `Transaction type ${input.type} does not use investment calculations.`,
      );
  }
}
