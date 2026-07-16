import type {
  TradeType,
  TransactionType,
} from '../../generated/prisma/enums';

export interface InvestmentTransactionDetailResponse {
  readonly id: string;
  readonly assetId: string;
  readonly assetName: string;
  readonly assetSymbol: string | null;
  readonly tradeType: TradeType;
  readonly quantity: string;
  readonly price: string;
  readonly fees: string;
  readonly notes: string | null;
}

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
  readonly investmentDetail: InvestmentTransactionDetailResponse | null;
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
