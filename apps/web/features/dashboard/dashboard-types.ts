export type DashboardAccountType =
  | "BANK"
  | "CASH_WALLET"
  | "DIGITAL_WALLET"
  | "BROKER"
  | "CRYPTO_WALLET"

export type DashboardTransactionType =
  | "INCOME"
  | "EXPENSE"
  | "TRANSFER"
  | "REFUND"
  | "FEE"
  | "INVESTMENT_BUY"
  | "INVESTMENT_SELL"
  | "ADJUSTMENT"

export interface DashboardMetrics {
  readonly totalNetWorth: string
  readonly liquidCash: string
  readonly investedCash: string
  readonly totalNetWorthChangePercent: number | null
  readonly liquidCashPercent: number
  readonly investedCashThisMonth: string | null
  readonly totalInvestmentValue: string
  readonly totalInvestmentCostBasis: string
  readonly totalUnrealizedGain: string
  readonly totalUnrealizedGainPercent: number | null
  readonly totalRealizedGain: string
}

export interface DashboardAccountItem {
  readonly id: string
  readonly name: string
  readonly type: DashboardAccountType
  readonly typeLabel: string
  readonly balance: string
  readonly currency: string
  readonly share: number
}

export interface MonthlySummaryItem {
  readonly month: string
  readonly income: string
  readonly expenses: string
  readonly investments: string
}

export interface RecentActivityItem {
  readonly id: string
  readonly label: string
  readonly account: string
  readonly amount: string
  readonly currency: string
  readonly type: DashboardTransactionType
  readonly tone: "success" | "error" | "neutral"
  readonly occurredAt: string
}

export interface AssetAllocationItem {
  readonly name: string
  readonly label: string
  readonly value: number
}

export interface InvestmentAllocationItem {
  readonly category: string
  readonly value: number
}

export interface DashboardUnavailableSection {
  readonly section: string
  readonly reason: string
}

export interface DashboardData {
  readonly baseCurrency: string
  readonly metrics: DashboardMetrics
  readonly accounts: readonly DashboardAccountItem[]
  readonly monthlySummary: readonly MonthlySummaryItem[]
  readonly recentActivity: readonly RecentActivityItem[]
  readonly assetAllocation: readonly AssetAllocationItem[]
  readonly investmentAllocation: readonly InvestmentAllocationItem[]
  readonly unavailable: readonly DashboardUnavailableSection[]
}
