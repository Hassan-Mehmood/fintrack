import { Prisma } from '../../generated/prisma/client';

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

export interface InvestmentTransactionInput {
  readonly type:
    | 'BUY'
    | 'SELL'
    | 'DIVIDEND'
    | 'INTEREST'
    | 'SPLIT'
    | 'BONUS'
    | 'REINVESTMENT';
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
  readonly averageCost: Decimal | null;
  readonly costBasis: Decimal;
  readonly currentValue: Decimal;
  readonly realizedGain: Decimal;
  readonly unrealizedGain: Decimal;
  readonly unrealizedGainPercent: Decimal | null;
}

export function calculateHolding(
  input: HoldingCalculationInput,
): HoldingCalculationResult {
  let totalBuyQuantity = new Decimal(0);
  let totalBuyCost = new Decimal(0);
  let totalSellQuantity = new Decimal(0);
  let totalSellProceeds = new Decimal(0);
  let quantity = new Decimal(0);

  for (const transaction of input.transactions) {
    switch (transaction.type) {
      case 'BUY':
      case 'REINVESTMENT':
        totalBuyQuantity = totalBuyQuantity.add(transaction.quantity);
        totalBuyCost = totalBuyCost.add(
          transaction.quantity.times(transaction.price).add(transaction.fees),
        );
        quantity = quantity.add(transaction.quantity);
        break;
      case 'SELL':
        totalSellQuantity = totalSellQuantity.add(transaction.quantity);
        totalSellProceeds = totalSellProceeds.add(
          transaction.quantity.times(transaction.price).sub(transaction.fees),
        );
        quantity = quantity.sub(transaction.quantity);
        break;
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

  const averageCost = totalBuyQuantity.isZero()
    ? null
    : totalBuyCost.dividedBy(totalBuyQuantity).toDecimalPlaces(8);

  const costBasisOfSoldShares = averageCost
    ? totalSellQuantity.times(averageCost)
    : new Decimal(0);
  const realizedGain = totalSellProceeds.sub(costBasisOfSoldShares);

  const currentCostBasis = totalBuyCost.sub(costBasisOfSoldShares);
  const displayAverageCost =
    !quantity.isZero() && !currentCostBasis.isZero()
      ? currentCostBasis.dividedBy(quantity).toDecimalPlaces(8)
      : averageCost;
  const currentPrice = input.currentPrice ?? new Decimal(0);
  const currentValue = quantity.times(currentPrice);
  const unrealizedGain = currentValue.sub(currentCostBasis);
  const unrealizedGainPercent = currentCostBasis.isZero()
    ? null
    : unrealizedGain.dividedBy(currentCostBasis).times(100).toDecimalPlaces(2);

  return {
    quantity,
    averageCost: displayAverageCost,
    costBasis: currentCostBasis,
    currentValue,
    realizedGain,
    unrealizedGain,
    unrealizedGainPercent,
  };
}
