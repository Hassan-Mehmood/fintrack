export const accountTypeOptions = [
  { value: "BANK", label: "Bank account" },
  { value: "CASH_WALLET", label: "Cash wallet" },
  { value: "DIGITAL_WALLET", label: "Digital wallet" },
  { value: "BROKER", label: "Broker account" },
  { value: "CRYPTO_WALLET", label: "Crypto wallet" },
] as const

export const accountTypeValues = accountTypeOptions.map(
  (option) => option.value
) as [AccountType, ...AccountType[]]

export type AccountType = (typeof accountTypeOptions)[number]["value"]

export interface Account {
  readonly id: string
  readonly name: string
  readonly type: AccountType
  readonly currency: string
  readonly openingBalance: string
  readonly currentBalance: string
  readonly openedAt: string
  readonly archivedAt: string | null
  readonly transactionCount: number
  readonly canDelete: boolean
  readonly createdAt: string
  readonly updatedAt: string
}

export interface AccountPayload {
  readonly name: string
  readonly type: AccountType
  readonly currency: string
  readonly openingBalance: string
  readonly openedAt?: string
}

export function getAccountTypeLabel(type: AccountType): string {
  return (
    accountTypeOptions.find((option) => option.value === type)?.label ?? type
  )
}
