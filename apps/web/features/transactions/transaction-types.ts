export const transactionTypeOptions = [
  { value: "INCOME", label: "Income" },
  { value: "EXPENSE", label: "Expense" },
  { value: "TRANSFER", label: "Transfer" },
  { value: "REFUND", label: "Refund" },
  { value: "FEE", label: "Fee" },
  { value: "INVESTMENT_BUY", label: "Investment buy" },
  { value: "INVESTMENT_SELL", label: "Investment sell" },
  { value: "ADJUSTMENT", label: "Adjustment" },
] as const

export const transactionTypeValues = transactionTypeOptions.map(
  (option) => option.value
) as [TransactionType, ...TransactionType[]]

export type TransactionType = (typeof transactionTypeOptions)[number]["value"]

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
}

export function getTransactionTypeLabel(type: TransactionType): string {
  return (
    transactionTypeOptions.find((option) => option.value === type)?.label ?? type
  )
}

export function isTransferType(type: TransactionType): boolean {
  return type === "TRANSFER"
}

export function isReversibleType(type: TransactionType): boolean {
  return type !== "TRANSFER" && type !== "ADJUSTMENT"
}

export function getTransactionSign(type: TransactionType): 1 | -1 {
  switch (type) {
    case "INCOME":
    case "REFUND":
    case "INVESTMENT_SELL":
      return 1
    case "EXPENSE":
    case "FEE":
    case "INVESTMENT_BUY":
    case "TRANSFER":
      return -1
    case "ADJUSTMENT":
      return 1
  }
}
