import { Prisma } from '../../generated/prisma/client';
import type { InvestmentTransactionInput } from './holdings';

const Decimal = Prisma.Decimal;

export interface SettlementHoldingDetail {
  readonly assetId: string;
  readonly settlementAssetId: string | null;
  readonly settlementRate?: Prisma.Decimal | null;
  readonly settlementQuantity?: Prisma.Decimal | null;
  readonly tradeType: string;
  readonly quantity: Prisma.Decimal;
  readonly price: Prisma.Decimal;
  readonly fees: Prisma.Decimal;
  readonly grossAmount: Prisma.Decimal;
  readonly transferDirection?: 'IN' | 'OUT';
}

export function holdingTransactionsForAsset(
  assetId: string,
  details: readonly SettlementHoldingDetail[],
): readonly InvestmentTransactionInput[] {
  const transactions: InvestmentTransactionInput[] = [];

  for (const detail of details) {
    if (detail.assetId === assetId) {
      const pairFeeValue = isPairTrade(detail)
        ? detail.fees.times(counterPrice(detail))
        : detail.fees;
      transactions.push({
        type:
          detail.tradeType === 'TRANSFER'
            ? detail.transferDirection === 'IN'
              ? 'DEPOSIT'
              : 'WITHDRAWAL'
            : (detail.tradeType as InvestmentTransactionInput['type']),
        quantity: detail.quantity,
        price: detail.price,
        fees: pairFeeValue,
      });
    }

    if (detail.settlementAssetId !== assetId) continue;

    if (isPairTrade(detail) && detail.tradeType === 'BUY') {
      transactions.push({
        type: 'SELL',
        quantity: detail.settlementQuantity!,
        price: counterPrice(detail),
        fees: new Decimal(0),
      });
      if (detail.fees.isPositive()) {
        transactions.push({
          type: 'WITHDRAWAL',
          quantity: detail.fees,
          price: new Decimal(0),
          fees: new Decimal(0),
        });
      }
    } else if (isPairTrade(detail) && detail.tradeType === 'SELL') {
      const netQuantity = detail.settlementQuantity!.sub(detail.fees);
      const netValue = detail.grossAmount.sub(
        detail.fees.times(counterPrice(detail)),
      );
      transactions.push({
        type: 'DEPOSIT',
        quantity: netQuantity,
        price: netQuantity.isZero() ? new Decimal(0) : netValue.dividedBy(netQuantity),
        fees: new Decimal(0),
      });
    } else if (detail.tradeType === 'BUY') {
      transactions.push({
        type: 'WITHDRAWAL',
        quantity: detail.grossAmount.add(detail.fees),
        price: new Decimal(0),
        fees: new Decimal(0),
      });
    } else if (detail.tradeType === 'SELL') {
      transactions.push({
        type: 'DEPOSIT',
        quantity: detail.grossAmount.sub(detail.fees),
        price: new Decimal(1),
        fees: new Decimal(0),
      });
    }
  }

  return transactions;
}

function isPairTrade(detail: SettlementHoldingDetail): boolean {
  return Boolean(
    detail.settlementRate?.isPositive() && detail.settlementQuantity?.isPositive(),
  );
}

function counterPrice(detail: SettlementHoldingDetail): Prisma.Decimal {
  return detail.price.dividedBy(detail.settlementRate!);
}
