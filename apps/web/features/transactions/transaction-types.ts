

export const transactionTypeOptions = [
  { value: "INCOME", label: "Income" },
  { value: "EXPENSE", label: "Expense" },
  { value: "TRANSFER", label: "Transfer" },
  { value: "REFUND", label: "Refund" },
  { value: "FEE", label: "Fee" },
  { value: "INVESTMENT_BUY", label: "Investment buy" },
  { value: "INVESTMENT_SELL", label: "Investment sell" },
  { value: "DIVIDEND", label: "Dividend" },
  { value: "INTEREST", label: "Interest" },
  { value: "INVESTMENT_SPLIT", label: "Stock split" },
  { value: "INVESTMENT_BONUS", label: "Bonus shares" },
  { value: "INVESTMENT_REINVESTMENT", label: "Reinvestment" },
  { value: "INVESTMENT_DEPOSIT", label: "Asset deposit" },
  { value: "INVESTMENT_WITHDRAWAL", label: "Asset withdrawal" },
  { value: "ADJUSTMENT", label: "Adjustment" },
] as const

export const transactionTypeValues = transactionTypeOptions.map(
  (option) => option.value
) as [TransactionType, ...TransactionType[]]

export type TransactionType = (typeof transactionTypeOptions)[number]["value"]

export const transactionStatusOptions = [
  { value: "PENDING", label: "Pending" },
  { value: "CLEARED", label: "Cleared" },
  { value: "FAILED", label: "Failed" },
  { value: "VOIDED", label: "Voided" },
] as const

export type TransactionStatus =
  (typeof transactionStatusOptions)[number]["value"]

export interface InvestmentTransactionDetail {
  readonly id: string
  readonly assetId: string
  readonly assetName: string
  readonly assetSymbol: string | null
  readonly tradeType:
    | "BUY"
    | "SELL"
    | "DIVIDEND"
    | "INTEREST"
    | "SPLIT"
    | "BONUS"
    | "REINVESTMENT"
    | "DEPOSIT"
    | "WITHDRAWAL"
  readonly quantity: string
  readonly price: string
  readonly priceCurrency: string
  readonly grossAmount: string
  readonly fees: string
  readonly fxRateUsdToPkr: string | null
  readonly fxRateSource: string | null
  readonly fxRateUpdatedAt: string | null
  readonly notes: string | null
}

export interface Transaction {
  readonly id: string
  readonly type: TransactionType
  readonly status: TransactionStatus
  readonly accountId: string
  readonly accountName: string
  readonly accountCurrency: string
  readonly destinationAccountId: string | null
  readonly destinationAccountName: string | null
  readonly reversalOfId: string | null
  readonly reversedById: string | null
  readonly amount: string
  readonly currency: string
  readonly occurredAt: string
  readonly category: string
  readonly description: string
  readonly merchant: string | null
  readonly notes: string | null
  readonly reference: string | null
  readonly labels: readonly string[]
  readonly deletedAt: string | null
  readonly investmentDetail: InvestmentTransactionDetail | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface TransactionPayload {
  readonly idempotencyKey?: string
  readonly type: TransactionType
  readonly status?: TransactionStatus
  readonly accountId: string
  readonly destinationAccountId?: string
  readonly amount?: string
  readonly currency: string
  readonly occurredAt: string
  readonly category: string
  readonly description: string
  readonly merchant?: string
  readonly notes?: string
  readonly reference?: string
  readonly labels?: readonly string[]
  readonly investment?: {
    readonly assetId: string
    readonly tradeType:
      | "BUY"
      | "SELL"
      | "DIVIDEND"
      | "INTEREST"
      | "SPLIT"
      | "BONUS"
      | "REINVESTMENT"
      | "DEPOSIT"
      | "WITHDRAWAL"
    readonly quantity?: string
    readonly price?: string
    readonly fees?: string
    readonly notes?: string
  } | null
}

export interface TransactionListParams {
  readonly search?: string
  readonly dateFrom?: string
  readonly dateTo?: string
  readonly accountIds?: readonly string[]
  readonly types?: readonly TransactionType[]
  readonly categories?: readonly string[]
  readonly labels?: readonly string[]
  readonly statuses?: readonly TransactionStatus[]
  readonly direction?: "IN" | "OUT"
  readonly minAmount?: string
  readonly maxAmount?: string
  readonly currencies?: readonly string[]
  readonly hasNote?: boolean
  readonly uncategorizedOnly?: boolean
  readonly sortBy?:
    | "date"
    | "amount"
    | "description"
    | "account"
    | "category"
    | "createdAt"
  readonly sortDirection?: "asc" | "desc"
  readonly page?: number
  readonly pageSize?: 25 | 50 | 100
}

export interface TransactionsListResult {
  readonly data: readonly Transaction[]
  readonly meta: {
    readonly total: number
    readonly page: number
    readonly pageSize: number
    readonly pageCount: number
    readonly baseCurrency: string
    readonly summary: {
      readonly moneyIn: string
      readonly moneyOut: string
      readonly netCashFlow: string
      readonly transactionCount: number
    }
    readonly filterOptions: {
      readonly categories: readonly string[]
      readonly labels: readonly string[]
      readonly currencies: readonly string[]
    }
  }
}

export interface BulkTransactionPayload {
  readonly transactionIds: readonly string[]
  readonly category?: string
  readonly status?: TransactionStatus
  readonly addLabels?: readonly string[]
  readonly removeLabels?: readonly string[]
  readonly delete?: boolean
}

export function getTransactionTypeLabel(type: TransactionType): string {
  return (
    transactionTypeOptions.find((option) => option.value === type)?.label ?? type
  )
}

export function isTransferType(type: TransactionType): boolean {
  return type === "TRANSFER"
}

export function isInvestmentType(type: TransactionType): boolean {
  return (
    type === "INVESTMENT_BUY" ||
    type === "INVESTMENT_SELL" ||
    type === "DIVIDEND" ||
    type === "INTEREST" ||
    type === "INVESTMENT_SPLIT" ||
    type === "INVESTMENT_BONUS" ||
    type === "INVESTMENT_REINVESTMENT" ||
    type === "INVESTMENT_DEPOSIT" ||
    type === "INVESTMENT_WITHDRAWAL"
  )
}

export function isReversibleType(type: TransactionType): boolean {
  return (
    type !== "TRANSFER" &&
    type !== "ADJUSTMENT" &&
    type !== "INVESTMENT_SPLIT" &&
    type !== "INVESTMENT_BONUS"
  )
}

export function getTransactionSign(type: TransactionType): 1 | -1 | 0 {
  switch (type) {
    case "INCOME":
    case "REFUND":
    case "INVESTMENT_SELL":
    case "DIVIDEND":
    case "INTEREST":
      return 1
    case "EXPENSE":
    case "FEE":
    case "INVESTMENT_BUY":
    case "INVESTMENT_REINVESTMENT":
    case "TRANSFER":
      return -1
    case "INVESTMENT_SPLIT":
    case "INVESTMENT_BONUS":
    case "INVESTMENT_DEPOSIT":
    case "INVESTMENT_WITHDRAWAL":
      return 0
    case "ADJUSTMENT":
      return 1
  }
}

export function getInvestmentTradeType(
  type: TransactionType
):
  | "BUY"
  | "SELL"
  | "DIVIDEND"
  | "INTEREST"
  | "SPLIT"
  | "BONUS"
  | "REINVESTMENT"
  | "DEPOSIT"
  | "WITHDRAWAL"
  | null {
  switch (type) {
    case "INVESTMENT_BUY":
      return "BUY"
    case "INVESTMENT_SELL":
      return "SELL"
    case "DIVIDEND":
      return "DIVIDEND"
    case "INTEREST":
      return "INTEREST"
    case "INVESTMENT_SPLIT":
      return "SPLIT"
    case "INVESTMENT_BONUS":
      return "BONUS"
    case "INVESTMENT_REINVESTMENT":
      return "REINVESTMENT"
    case "INVESTMENT_DEPOSIT":
      return "DEPOSIT"
    case "INVESTMENT_WITHDRAWAL":
      return "WITHDRAWAL"
    default:
      return null
  }
}
