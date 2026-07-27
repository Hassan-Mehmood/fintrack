import { Prisma } from '../../generated/prisma/client';

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

export class CurrencyConverter {
  readonly baseCurrency: string;
  private readonly rate: Decimal | null;

  constructor(baseCurrency: string, exchangeRate: string | null) {
    this.baseCurrency = baseCurrency;
    this.rate = exchangeRate ? new Decimal(exchangeRate) : null;
  }

  convert(amount: Decimal, fromCurrency: string): Decimal {
    if (fromCurrency === this.baseCurrency) {
      return amount;
    }

    if (!this.rate || this.rate.isZero()) {
      return amount;
    }

    // If base is USD and from is PKR: divide by rate (e.g., 280 PKR / 280 = 1 USD)
    // If base is PKR and from is USD: multiply by rate (e.g., 1 USD * 280 = 280 PKR)
    if (this.baseCurrency === 'USD' && fromCurrency === 'PKR') {
      return amount.dividedBy(this.rate).toDecimalPlaces(8);
    }

    if (this.baseCurrency === 'PKR' && fromCurrency === 'USD') {
      return amount.times(this.rate).toDecimalPlaces(8);
    }

    return amount;
  }
}
