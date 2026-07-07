import type { TransactionType } from '../../generated/prisma/enums';

export interface TransactionResponse {
  readonly id: string;
  readonly type: TransactionType;
  readonly accountId: string;
  readonly accountName: string;
  readonly accountCurrency: string;
  readonly destinationAccountId: string | null;
  readonly destinationAccountName: string | null;
  readonly reversalOfId: string | null;
  readonly reversedById: string | null;
  readonly amount: string;
  readonly currency: string;
  readonly occurredAt: string;
  readonly description: string;
  readonly merchant: string | null;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TransactionsListResponse {
  readonly data: readonly TransactionResponse[];
  readonly meta: {
    readonly total: number;
  };
}

export interface TransactionItemResponse {
  readonly data: TransactionResponse;
}

export interface DeleteTransactionResponse {
  readonly data: {
    readonly id: string;
    readonly deleted: true;
  };
}
