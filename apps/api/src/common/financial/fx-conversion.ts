import { Prisma } from '../../generated/prisma/client';

const Decimal = Prisma.Decimal;

export type SupportedReportingCurrency = 'USD' | 'PKR';

export function convertUsdPkr(
  amount: Prisma.Decimal,
  fromCurrency: string,
  toCurrency: string,
  usdToPkrRate: Prisma.Decimal | null,
): Prisma.Decimal | null {
  if (fromCurrency === toCurrency) {
    return amount;
  }

  if (!usdToPkrRate || usdToPkrRate.isZero()) {
    return null;
  }

  if (fromCurrency === 'USD' && toCurrency === 'PKR') {
    return amount.times(usdToPkrRate).toDecimalPlaces(8, Decimal.ROUND_HALF_UP);
  }

  if (fromCurrency === 'PKR' && toCurrency === 'USD') {
    return amount
      .dividedBy(usdToPkrRate)
      .toDecimalPlaces(8, Decimal.ROUND_HALF_UP);
  }

  return null;
}
