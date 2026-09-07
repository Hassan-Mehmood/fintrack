import { Prisma } from '../../generated/prisma/client';

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

export interface InvestmentTransactionInput {
  readonly type:
    | 'OPENING'
    | 'BUY'
    | 'SELL'
    | 'DIVIDEND'
    | 'INTEREST'
    | 'SPLIT'
    | 'BONUS'
    | 'REINVESTMENT'
    | 'DEPOSIT'
    | 'WITHDRAWAL';
  readonly quantity: Decimal;
  readonly price: Decimal;
  readonly fees: Decimal;
}

export interface HoldingCalculationInput {
  readonly currentPrice: Decimal | null;
  readonly priceCurrency: string | null;
  readonly transactions: readonly InvestmentTransactionInput[];
}

export interface HoldingCalculationResult {
  readonly quantity: Decimal;
  readonly isCostBasisKnown: boolean;
  readonly averageCost: Decimal | null;
  readonly costBasis: Decimal;
  readonly currentValue: Decimal | null;
  readonly realizedGain: Decimal;
  readonly unrealizedGain: Decimal | null;
  readonly unrealizedGainPercent: Decimal | null;
}

export function calculateHolding(
  input: HoldingCalculationInput,
): HoldingCalculationResult {
  let quantity = new Decimal(0);
  let costBasis = new Decimal(0);
  let realizedGain = new Decimal(0);
  let isCostBasisKnown = true;

  for (const transaction of input.transactions) {
    switch (transaction.type) {
      case 'BUY':
      case 'OPENING':
      case 'REINVESTMENT':
      case 'DEPOSIT':
        if (
          transaction.type === 'OPENING' &&
          transaction.quantity.isPositive() &&
          transaction.price.isZero()
        ) {
          isCostBasisKnown = false;
        }
        costBasis = costBasis.add(
          transaction.quantity.times(transaction.price).add(transaction.fees),
        );
        quantity = quantity.add(transaction.quantity);
        break;
      case 'SELL': {
        const averageCost = quantity.isZero()
          ? new Decimal(0)
          : costBasis.dividedBy(quantity);
        const removedCost = transaction.quantity.times(averageCost);
        const proceeds = transaction.quantity
          .times(transaction.price)
          .sub(transaction.fees);
        realizedGain = realizedGain.add(proceeds.sub(removedCost));
        costBasis = costBasis.sub(removedCost);
        quantity = quantity.sub(transaction.quantity);
        break;
      }
      case 'WITHDRAWAL': {
        const averageCost = quantity.isZero()
          ? new Decimal(0)
          : costBasis.dividedBy(quantity);
        costBasis = costBasis.sub(transaction.quantity.times(averageCost));
        realizedGain = realizedGain.sub(transaction.fees);
        quantity = quantity.sub(transaction.quantity);
        break;
      }
      case 'BONUS':
        quantity = quantity.add(transaction.quantity);
        break;
      case 'SPLIT':
        quantity = quantity.times(transaction.quantity);
        break;
      case 'DIVIDEND':
      case 'INTEREST':
        break;
    }
  }

  const averageCost =
    !quantity.isZero() && !costBasis.isZero()
      ? costBasis.dividedBy(quantity).toDecimalPlaces(8)
      : null;
  const currentValue = input.currentPrice
    ? quantity.times(input.currentPrice)
    : quantity.isZero()
      ? new Decimal(0)
      : null;
  const unrealizedGain = currentValue ? currentValue.sub(costBasis) : null;
  const unrealizedGainPercent =
    unrealizedGain && !costBasis.isZero()
      ? unrealizedGain.dividedBy(costBasis).times(100).toDecimalPlaces(2)
      : null;

  return {
    quantity,
    isCostBasisKnown,
    averageCost,
    costBasis,
    currentValue,
    realizedGain,
    unrealizedGain,
    unrealizedGainPercent,
  };
}
