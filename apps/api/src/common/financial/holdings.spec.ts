import { Prisma } from '../../generated/prisma/client';
import { calculateHolding } from './holdings';

const Decimal = Prisma.Decimal;

describe('calculateHolding', () => {
  it('calculates a single buy holding', () => {
    const result = calculateHolding({
      currentPrice: new Decimal(70000),
      priceCurrency: 'USD',
      transactions: [
        {
          type: 'BUY',
          quantity: new Decimal(1),
          price: new Decimal(60000),
          fees: new Decimal(10),
        },
      ],
    });

    expect(result.quantity.toString()).toBe('1');
    expect(result.averageCost?.toString()).toBe('60010');
    expect(result.costBasis.toString()).toBe('60010');
    expect(result.currentValue.toString()).toBe('70000');
    expect(result.realizedGain.toString()).toBe('0');
    expect(result.unrealizedGain.toString()).toBe('9990');
    expect(result.unrealizedGainPercent?.toString()).toBe('16.65');
  });

  it('calculates average cost across multiple buys', () => {
    const result = calculateHolding({
      currentPrice: new Decimal(75000),
      priceCurrency: 'USD',
      transactions: [
        {
          type: 'BUY',
          quantity: new Decimal(1),
          price: new Decimal(60000),
          fees: new Decimal(0),
        },
        {
          type: 'BUY',
          quantity: new Decimal(1),
          price: new Decimal(80000),
          fees: new Decimal(0),
        },
      ],
    });

    expect(result.quantity.toString()).toBe('2');
    expect(result.averageCost?.toString()).toBe('70000');
    expect(result.costBasis.toString()).toBe('140000');
    expect(result.currentValue.toString()).toBe('150000');
    expect(result.unrealizedGain.toString()).toBe('10000');
  });

  it('treats an opening position like a buy for quantity and basis', () => {
    const result = calculateHolding({
      currentPrice: new Decimal(15),
      priceCurrency: 'USD',
      transactions: [
        {
          type: 'OPENING',
          quantity: new Decimal(100),
          price: new Decimal(12),
          fees: new Decimal(0),
        },
      ],
    });

    expect(result.quantity.toString()).toBe('100');
    expect(result.averageCost?.toString()).toBe('12');
    expect(result.costBasis.toString()).toBe('1200');
    expect(result.currentValue?.toString()).toBe('1500');
  });

  it('calculates realized gain from a partial sell', () => {
    const result = calculateHolding({
      currentPrice: new Decimal(70000),
      priceCurrency: 'USD',
      transactions: [
        {
          type: 'BUY',
          quantity: new Decimal(2),
          price: new Decimal(60000),
          fees: new Decimal(0),
        },
        {
          type: 'SELL',
          quantity: new Decimal(1),
          price: new Decimal(65000),
          fees: new Decimal(5),
        },
      ],
    });

    expect(result.quantity.toString()).toBe('1');
    expect(result.averageCost?.toString()).toBe('60000');
    expect(result.realizedGain.toString()).toBe('4995');
    expect(result.costBasis.toString()).toBe('60000');
    expect(result.currentValue.toString()).toBe('70000');
    expect(result.unrealizedGain.toString()).toBe('10000');
  });

  it('handles a fully sold position', () => {
    const result = calculateHolding({
      currentPrice: new Decimal(70000),
      priceCurrency: 'USD',
      transactions: [
        {
          type: 'BUY',
          quantity: new Decimal(1),
          price: new Decimal(60000),
          fees: new Decimal(0),
        },
        {
          type: 'SELL',
          quantity: new Decimal(1),
          price: new Decimal(65000),
          fees: new Decimal(0),
        },
      ],
    });

    expect(result.quantity.toString()).toBe('0');
    expect(result.costBasis.toString()).toBe('0');
    expect(result.currentValue.toString()).toBe('0');
    expect(result.realizedGain.toString()).toBe('5000');
    expect(result.unrealizedGain.toString()).toBe('0');
    expect(result.unrealizedGainPercent).toBeNull();
  });

  it('returns zero values when there are no transactions', () => {
    const result = calculateHolding({
      currentPrice: null,
      priceCurrency: 'USD',
      transactions: [],
    });

    expect(result.quantity.toString()).toBe('0');
    expect(result.averageCost).toBeNull();
    expect(result.costBasis.toString()).toBe('0');
    expect(result.currentValue.toString()).toBe('0');
    expect(result.realizedGain.toString()).toBe('0');
    expect(result.unrealizedGain.toString()).toBe('0');
    expect(result.unrealizedGainPercent).toBeNull();
  });

  it('treats a reinvestment like a buy', () => {
    const result = calculateHolding({
      currentPrice: new Decimal(70000),
      priceCurrency: 'USD',
      transactions: [
        {
          type: 'BUY',
          quantity: new Decimal(1),
          price: new Decimal(60000),
          fees: new Decimal(10),
        },
        {
          type: 'REINVESTMENT',
          quantity: new Decimal(0.5),
          price: new Decimal(65000),
          fees: new Decimal(5),
        },
      ],
    });

    expect(result.quantity.toString()).toBe('1.5');
    expect(result.costBasis.toString()).toBe('92515');
  });

  it('applies a stock split to the holding quantity', () => {
    const result = calculateHolding({
      currentPrice: new Decimal(35000),
      priceCurrency: 'USD',
      transactions: [
        {
          type: 'BUY',
          quantity: new Decimal(1),
          price: new Decimal(60000),
          fees: new Decimal(0),
        },
        {
          type: 'SPLIT',
          quantity: new Decimal(2),
          price: new Decimal(0),
          fees: new Decimal(0),
        },
      ],
    });

    expect(result.quantity.toString()).toBe('2');
    expect(result.costBasis.toString()).toBe('60000');
    expect(result.currentValue.toString()).toBe('70000');
    expect(result.averageCost?.toString()).toBe('30000');
  });

  it('adds bonus shares without changing the cost basis', () => {
    const result = calculateHolding({
      currentPrice: new Decimal(70000),
      priceCurrency: 'USD',
      transactions: [
        {
          type: 'BUY',
          quantity: new Decimal(1),
          price: new Decimal(60000),
          fees: new Decimal(0),
        },
        {
          type: 'BONUS',
          quantity: new Decimal(1),
          price: new Decimal(0),
          fees: new Decimal(0),
        },
      ],
    });

    expect(result.quantity.toString()).toBe('2');
    expect(result.costBasis.toString()).toBe('60000');
    expect(result.averageCost?.toString()).toBe('30000');
  });

  it('ignores dividends and interest for quantity and cost basis', () => {
    const result = calculateHolding({
      currentPrice: new Decimal(70000),
      priceCurrency: 'USD',
      transactions: [
        {
          type: 'BUY',
          quantity: new Decimal(1),
          price: new Decimal(60000),
          fees: new Decimal(0),
        },
        {
          type: 'DIVIDEND',
          quantity: new Decimal(0),
          price: new Decimal(0),
          fees: new Decimal(0),
        },
        {
          type: 'INTEREST',
          quantity: new Decimal(0),
          price: new Decimal(0),
          fees: new Decimal(0),
        },
      ],
    });

    expect(result.quantity.toString()).toBe('1');
    expect(result.costBasis.toString()).toBe('60000');
  });

  it('adds deposits to cost basis and removes withdrawals without sale proceeds', () => {
    const result = calculateHolding({
      currentPrice: new Decimal(120),
      priceCurrency: 'USD',
      transactions: [
        {
          type: 'DEPOSIT',
          quantity: new Decimal(10),
          price: new Decimal(100),
          fees: new Decimal(5),
        },
        {
          type: 'WITHDRAWAL',
          quantity: new Decimal(2),
          price: new Decimal(110),
          fees: new Decimal(3),
        },
      ],
    });

    expect(result.quantity.toString()).toBe('8');
    expect(result.costBasis.toString()).toBe('804');
    expect(result.realizedGain.toString()).toBe('-3');
    expect(result.currentValue?.toString()).toBe('960');
  });

  it('leaves price-dependent values unavailable when a held asset has no price', () => {
    const result = calculateHolding({
      currentPrice: null,
      priceCurrency: 'USD',
      transactions: [
        {
          type: 'BUY',
          quantity: new Decimal(1),
          price: new Decimal(100),
          fees: new Decimal(0),
        },
      ],
    });

    expect(result.currentValue).toBeNull();
    expect(result.unrealizedGain).toBeNull();
  });
});
