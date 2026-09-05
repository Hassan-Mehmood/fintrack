import { describe, expect, it } from "vitest"

import { moveAccountId } from "./account-order"

describe("moveAccountId", () => {
  it("moves an account down to a dropped row", () => {
    expect(moveAccountId(["a", "b", "c"], "a", 2)).toEqual(["b", "c", "a"])
  })

  it("moves an account up to a dropped row", () => {
    expect(moveAccountId(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"])
  })

  it("keeps the order for invalid and no-op moves", () => {
    const accountIds = ["a", "b", "c"]
    expect(moveAccountId(accountIds, "b", 1)).toBe(accountIds)
    expect(moveAccountId(accountIds, "missing", 1)).toBe(accountIds)
    expect(moveAccountId(accountIds, "b", 4)).toBe(accountIds)
  })
})
