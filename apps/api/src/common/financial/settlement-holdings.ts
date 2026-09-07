import { Prisma } from '../../generated/prisma/client';
import type { InvestmentTransactionInput } from './holdings';

const Decimal = Prisma.Decimal;

export interface SettlementHoldingDetail {
  readonly assetId: string;
  readonly settlementAssetId: string | null;
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
      transactions.push({
        type:
          detail.tradeType === 'TRANSFER'
            ? detail.transferDirection === 'IN'
              ? 'DEPOSIT'
              : 'WITHDRAWAL'
            : (detail.tradeType as InvestmentTransactionInput['type']),
        quantity: detail.quantity,
        price: detail.price,
        fees: detail.fees,
      });
    }

    if (detail.settlementAssetId !== assetId) continue;

    if (detail.tradeType === 'BUY') {
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
