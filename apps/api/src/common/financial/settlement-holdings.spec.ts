import { Prisma } from '../../generated/prisma/client';
import { holdingTransactionsForAsset } from './settlement-holdings';

const Decimal = Prisma.Decimal;

describe('holdingTransactionsForAsset', () => {
  it('turns paired buys into settlement withdrawals including fees', () => {
    const [movement] = holdingTransactionsForAsset('usdt', [
      detail({ tradeType: 'BUY', grossAmount: '1000', fees: '2' }),
    ]);

    expect(movement?.type).toBe('WITHDRAWAL');
    expect(movement?.quantity.toString()).toBe('1002');
  });

  it('turns paired sells into settlement deposits net of fees', () => {
    const [movement] = holdingTransactionsForAsset('usdt', [
      detail({ tradeType: 'SELL', grossAmount: '1000', fees: '2' }),
    ]);

    expect(movement?.type).toBe('DEPOSIT');
    expect(movement?.quantity.toString()).toBe('998');
    expect(movement?.price.toString()).toBe('1');
  });
});

function detail(input: {
  tradeType: string;
  grossAmount: string;
  fees: string;
}) {
  return {
    assetId: 'btc',
    settlementAssetId: 'usdt',
    tradeType: input.tradeType,
    quantity: new Decimal(0.02),
    price: new Decimal(50000),
    grossAmount: new Decimal(input.grossAmount),
    fees: new Decimal(input.fees),
  };
}
