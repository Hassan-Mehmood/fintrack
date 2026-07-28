import { describe, expect, it } from "vitest"

import { formatAmount, formatSignedAmount } from "./formatting"

describe("currency formatting", () => {
  it("shows exactly two decimal places for USD and PKR amounts", () => {
    expect(formatAmount("1200", "USD")).toBe("USD 1,200.00")
    expect(formatAmount("75.5", "PKR")).toBe("PKR 75.50")
  })

  it("rounds currency amounts to two decimal places", () => {
    expect(formatAmount("12.345", "USD")).toBe("USD 12.35")
    expect(formatAmount("-999.994", "PKR")).toBe("PKR -999.99")
  })

  it("formats signed amounts with exactly two decimal places", () => {
    expect(formatSignedAmount("4", "USD")).toBe("+ USD 4.00")
    expect(formatSignedAmount("-4.126", "PKR")).toBe("- PKR 4.13")
  })
})
