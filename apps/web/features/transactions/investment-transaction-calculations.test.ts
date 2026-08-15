import { describe, expect, it } from "vitest"

import {
  calculateInvestmentTransactionAmounts,
  multiplyQuantities,
} from "./investment-transaction-calculations"

describe("investment transaction calculations", () => {
  it("calculates a buy total without floating-point drift", () => {
    expect(
      calculateInvestmentTransactionAmounts({
        type: "INVESTMENT_BUY",
        quantity: "0.1",
        price: "0.2",
        fees: "0.01",
      })
    ).toEqual({
      grossAmount: "0.02",
      cashImpact: "0.03",
    })
  })

  it("calculates net sale proceeds", () => {
    expect(
      calculateInvestmentTransactionAmounts({
        type: "INVESTMENT_SELL",
        quantity: "2.5",
        price: "12.5",
        fees: "1.25",
      })
    ).toEqual({
      grossAmount: "31.25",
      cashImpact: "30",
    })
  })

  it("calculates resulting split quantity", () => {
    expect(multiplyQuantities("1.25", "3")).toBe("3.75")
  })
})
