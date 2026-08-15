import { Prisma } from '../../generated/prisma/client';
import { calculateInvestmentTransactionAmounts } from './investment-transaction-calculations';

const Decimal = Prisma.Decimal;

describe('calculateInvestmentTransactionAmounts', () => {
  it('adds fees to an investment purchase', () => {
    const result = calculateInvestmentTransactionAmounts({
      type: 'INVESTMENT_BUY',
      quantity: new Decimal('0.015'),
      price: new Decimal('67000'),
      fees: new Decimal('5'),
    });

    expect(result.grossAmount.toString()).toBe('1005');
    expect(result.cashImpact.toString()).toBe('1010');
  });

  it('subtracts fees from investment sale proceeds', () => {
    const result = calculateInvestmentTransactionAmounts({
      type: 'INVESTMENT_SELL',
      quantity: new Decimal('2.5'),
      price: new Decimal('12.50'),
      fees: new Decimal('1.25'),
    });

    expect(result.grossAmount.toString()).toBe('31.25');
    expect(result.cashImpact.toString()).toBe('30');
  });

  it('uses the purchase calculation for reinvestments', () => {
    const result = calculateInvestmentTransactionAmounts({
      type: 'INVESTMENT_REINVESTMENT',
      quantity: new Decimal('1.25'),
      price: new Decimal('8'),
      fees: new Decimal('0.50'),
    });

    expect(result.grossAmount.toString()).toBe('10');
    expect(result.cashImpact.toString()).toBe('10.5');
  });

  it('returns no cash or gross amount for non-cash asset movements', () => {
    const result = calculateInvestmentTransactionAmounts({
      type: 'INVESTMENT_BONUS',
      quantity: new Decimal('0.125'),
      price: new Decimal(0),
      fees: new Decimal(0),
    });

    expect(result.grossAmount.isZero()).toBe(true);
    expect(result.cashImpact.isZero()).toBe(true);
  });

  it('rounds multiplication to the database scale', () => {
    const result = calculateInvestmentTransactionAmounts({
      type: 'INVESTMENT_BUY',
      quantity: new Decimal('0.12345678'),
      price: new Decimal('0.12345678'),
      fees: new Decimal(0),
    });

    expect(result.grossAmount.toString()).toBe('0.01524158');
  });
});
