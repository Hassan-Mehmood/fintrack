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

  it('records a BTC-funded buy as a BTC sale plus a fee withdrawal', () => {
    const movements = holdingTransactionsForAsset('btc', [
      detail({
        tradeType: 'BUY',
        grossAmount: '2000',
        fees: '0.001',
        settlementRate: '0.04',
        settlementQuantity: '0.04',
        settlementAssetId: 'btc',
      }),
    ]);

    expect(movements).toHaveLength(2);
    expect(movements[0]).toMatchObject({ type: 'SELL', quantity: new Decimal('0.04') });
    expect(movements[1]).toMatchObject({ type: 'WITHDRAWAL', quantity: new Decimal('0.001') });
  });

  it('records a BTC-received sale with its net exchange basis', () => {
    const [movement] = holdingTransactionsForAsset('btc', [
      detail({
        tradeType: 'SELL',
        grossAmount: '2000',
        fees: '0.001',
        settlementRate: '0.04',
        settlementQuantity: '0.04',
        settlementAssetId: 'btc',
      }),
    ]);

    expect(movement?.type).toBe('DEPOSIT');
    expect(movement?.quantity.toString()).toBe('0.039');
  });
});

function detail(input: {
  tradeType: string;
  grossAmount: string;
  fees: string;
  settlementRate?: string;
  settlementQuantity?: string;
  settlementAssetId?: string;
  assetId?: string;
}) {
  return {
    assetId: input.assetId ?? 'eth',
    settlementAssetId: input.settlementAssetId ?? 'usdt',
    settlementRate: input.settlementRate ? new Decimal(input.settlementRate) : null,
    settlementQuantity: input.settlementQuantity ? new Decimal(input.settlementQuantity) : null,
    tradeType: input.tradeType,
    quantity: new Decimal(0.02),
    price: new Decimal(50000),
    grossAmount: new Decimal(input.grossAmount),
    fees: new Decimal(input.fees),
  };
}
