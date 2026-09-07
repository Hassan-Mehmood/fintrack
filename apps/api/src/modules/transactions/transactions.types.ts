import type {
  TradeType,
  TransactionStatus,
  TransactionType,
} from '../../generated/prisma/enums';

export interface InvestmentTransactionDetailResponse {
  readonly id: string;
  readonly assetId: string;
  readonly assetName: string;
  readonly assetSymbol: string | null;
  readonly settlementAssetId: string | null;
  readonly settlementAssetName: string | null;
  readonly settlementAssetSymbol: string | null;
  readonly settlementQuantity: string | null;
  readonly pairLabel: string | null;
  readonly tradeType: TradeType;
  readonly quantity: string;
  readonly price: string;
  readonly priceCurrency: string;
  readonly grossAmount: string;
  readonly fees: string;
  readonly fxRateUsdToPkr: string | null;
  readonly fxRateSource: string | null;
  readonly fxRateUpdatedAt: string | null;
  readonly notes: string | null;
}

export interface TransactionResponse {
  readonly id: string;
  readonly type: TransactionType;
  readonly status: TransactionStatus;
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
  readonly category: string;
  readonly description: string;
  readonly merchant: string | null;
  readonly notes: string | null;
  readonly reference: string | null;
  readonly labels: readonly string[];
  readonly deletedAt: string | null;
  readonly investmentDetail: InvestmentTransactionDetailResponse | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TransactionsListResponse {
  readonly data: readonly TransactionResponse[];
  readonly meta: {
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
    readonly pageCount: number;
    readonly baseCurrency: string;
    readonly summary: {
      readonly moneyIn: string;
      readonly moneyOut: string;
      readonly netCashFlow: string;
      readonly transactionCount: number;
    };
    readonly filterOptions: {
      readonly categories: readonly string[];
      readonly labels: readonly string[];
      readonly currencies: readonly string[];
    };
  };
}

export interface AccountTransactionResponse extends TransactionResponse {
  readonly accountEffect: string;
  readonly accountDirection: 'IN' | 'OUT' | 'NEUTRAL';
}

export interface AccountTransactionsListResponse extends Omit<
  TransactionsListResponse,
  'data'
> {
  readonly data: readonly AccountTransactionResponse[];
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

export interface BulkUpdateTransactionsResponse {
  readonly data: {
    readonly updatedIds: readonly string[];
  };
}
