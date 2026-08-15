import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { HoldingsTable } from "./holdings-table"
import type { Holding } from "./investment-types"

afterEach(cleanup)

describe("HoldingsTable", () => {
  it("shows account currency and native values without relabeling them", () => {
    render(
      <HoldingsTable
        groupBy="ACCOUNT"
        holdings={[holding]}
        reportingCurrency="PKR"
      />
    )

    expect(screen.getAllByText("Brokerage · PKR").length).toBeGreaterThan(0)
    expect(screen.getByText("PKR")).toBeInTheDocument()
    expect(screen.getAllByText("Native: USD 100.00").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Native: USD 120.00").length).toBeGreaterThan(0)
  })
})

const holding: Holding = {
  assetId: "asset-1",
  assetName: "Acme",
  assetSymbol: "ACME",
  categoryName: "Stocks",
  riskProfileName: null,
  accountId: "account-1",
  accountName: "Brokerage",
  accountCurrency: "PKR",
  portfolios: [],
  quantity: "1",
  nativeCurrency: "USD",
  nativeAverageCost: "100",
  nativeCurrentPrice: "120",
  nativeCostBasis: "100",
  nativeCurrentValue: "120",
  nativeRealizedGain: "0",
  nativeUnrealizedGain: "20",
  reportingCurrency: "PKR",
  averageCost: "25000",
  currentPrice: "33600",
  costBasis: "25000",
  currentValue: "33600",
  realizedGain: "0",
  unrealizedGain: "8600",
  unrealizedGainPercent: 34.4,
  priceProvider: null,
  priceStatus: "AVAILABLE",
  priceType: "CURRENT",
  priceUpdatedAt: null,
  providerDate: null,
  providerMarketAt: null,
  priceChange: null,
  priceChangePercent: null,
  hasMissingHistoricalFx: false,
}
