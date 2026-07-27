

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
  { value: "ADJUSTMENT", label: "Adjustment" },
] as const

export const transactionTypeValues = transactionTypeOptions.map(
  (option) => option.value
) as [TransactionType, ...TransactionType[]]

export type TransactionType = (typeof transactionTypeOptions)[number]["value"]

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
  readonly quantity: string
  readonly price: string
  readonly fees: string
  readonly notes: string | null
}

export interface Transaction {
  readonly id: string
  readonly type: TransactionType
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
  readonly description: string
  readonly merchant: string | null
  readonly notes: string | null
  readonly investmentDetail: InvestmentTransactionDetail | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface TransactionPayload {
  readonly type: TransactionType
  readonly accountId: string
  readonly destinationAccountId?: string
  readonly amount: string
  readonly currency: string
  readonly occurredAt: string
  readonly description: string
  readonly merchant?: string
  readonly notes?: string
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
    readonly quantity: string
    readonly price: string
    readonly fees?: string
    readonly notes?: string
  }
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
    type === "INVESTMENT_REINVESTMENT"
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
    default:
      return null
  }
}
