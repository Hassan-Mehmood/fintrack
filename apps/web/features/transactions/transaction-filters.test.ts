import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  clearTransactionFilters,
  readTransactionFilters,
  toTransactionListParams,
  writeTransactionFilter,
} from "./transaction-filters"

describe("transaction URL filters", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-30T12:00:00.000Z"))
  })

  afterEach(() => vi.useRealTimers())

  it("uses this month and 25 rows by default", () => {
    const filters = readTransactionFilters(new URLSearchParams())

    expect(filters.datePreset).toBe("thisMonth")
    expect(filters.pageSize).toBe(25)
    const params = toTransactionListParams(filters, "")
    expect(params).toMatchObject({
      page: 1,
      pageSize: 25,
      sortBy: "date",
      sortDirection: "desc",
    })
    expect(new Date(params.dateFrom ?? "").getDate()).toBe(1)
    expect(new Date(params.dateTo ?? "").getDate()).toBe(30)
  })

  it("reads multi-value filters and sends them to the server", () => {
    const filters = readTransactionFilters(
      new URLSearchParams(
        "date=allTime&accounts=account-1,account-2&types=INCOME,REFUND&statuses=CLEARED&direction=IN&minAmount=10&page=3&pageSize=50"
      )
    )

    expect(toTransactionListParams(filters, "salary")).toMatchObject({
      search: "salary",
      accountIds: ["account-1", "account-2"],
      types: ["INCOME", "REFUND"],
      statuses: ["CLEARED"],
      direction: "IN",
      minAmount: "10",
      page: 3,
      pageSize: 50,
    })
  })

  it("resets pagination whenever a filter changes", () => {
    const current = new URLSearchParams("page=4&types=EXPENSE")
    const next = writeTransactionFilter(current, "statuses", ["CLEARED"])

    expect(next.get("page")).toBeNull()
    expect(next.get("statuses")).toBe("CLEARED")
  })

  it.each([
    "thisWeek",
    "thisMonth",
    "lastMonth",
    "thisYear",
    "last7Days",
    "last30Days",
  ])("calculates a bounded range for %s", (datePreset) => {
    const filters = readTransactionFilters(
      new URLSearchParams(`date=${datePreset}`)
    )
    const params = toTransactionListParams(filters, "")

    expect(params.dateFrom).toBeDefined()
    expect(params.dateTo).toBeDefined()
    expect(new Date(params.dateFrom ?? "").getTime()).toBeLessThanOrEqual(
      new Date(params.dateTo ?? "").getTime()
    )
  })

  it("supports custom ranges and all time", () => {
    const custom = toTransactionListParams(
      readTransactionFilters(
        new URLSearchParams(
          "date=custom&from=2026-08-05&to=2026-08-12&sortBy=amount&sortDirection=asc&page=2&pageSize=100"
        )
      ),
      ""
    )
    expect(new Date(custom.dateFrom ?? "").getDate()).toBe(5)
    expect(new Date(custom.dateTo ?? "").getDate()).toBe(12)
    expect(custom).toMatchObject({
      sortBy: "amount",
      sortDirection: "asc",
      page: 2,
      pageSize: 100,
    })

    const allTime = toTransactionListParams(
      readTransactionFilters(new URLSearchParams("date=allTime")),
      ""
    )
    expect(allTime.dateFrom).toBeUndefined()
    expect(allTime.dateTo).toBeUndefined()
  })

  it("clears filters back to this month", () => {
    expect(clearTransactionFilters().toString()).toBe("date=thisMonth")
  })
})
