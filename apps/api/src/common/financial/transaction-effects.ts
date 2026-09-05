import { Prisma } from '../../generated/prisma/client';
import type { TransactionType } from '../../generated/prisma/enums';

const Decimal = Prisma.Decimal.clone({ precision: 40 });

export function getSourceAccountEffect(
  type: TransactionType,
  amount: Prisma.Decimal,
): Prisma.Decimal {
  switch (type) {
    case 'INCOME':
    case 'REFUND':
    case 'INVESTMENT_SELL':
    case 'DIVIDEND':
    case 'INTEREST':
      return amount;
    case 'EXPENSE':
    case 'FEE':
    case 'INVESTMENT_BUY':
    case 'INVESTMENT_REINVESTMENT':
    case 'TRANSFER':
      return amount.neg();
    case 'INVESTMENT_SPLIT':
    case 'INVESTMENT_BONUS':
    case 'INVESTMENT_DEPOSIT':
    case 'INVESTMENT_WITHDRAWAL':
      return new Prisma.Decimal(0);
    case 'ADJUSTMENT':
      return amount;
  }
}

export function hasDestinationBalanceEffect(type: TransactionType): boolean {
  return type === 'TRANSFER' || type === 'INVESTMENT_BUY';
}

export function calculateAccountBalance(
  openingBalance: Prisma.Decimal,
  accountId: string,
  transactions: ReadonlyArray<{
    readonly type: TransactionType;
    readonly accountId: string;
    readonly destinationAccountId: string | null;
    readonly amount: Prisma.Decimal;
  }>,
): Prisma.Decimal {
  let balance = new Decimal(openingBalance.toString());

  for (const transaction of transactions) {
    if (transaction.accountId === accountId) {
      balance = balance.add(
        getSourceAccountEffect(transaction.type, transaction.amount),
      );
    }

    if (
      transaction.destinationAccountId === accountId &&
      hasDestinationBalanceEffect(transaction.type)
    ) {
      balance = balance.add(transaction.amount);
    }
  }

  return new Prisma.Decimal(balance);
}
