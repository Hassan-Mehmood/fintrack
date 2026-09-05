import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AdjustBalanceDialog } from "./adjust-balance-dialog"
import { adjustAccountBalance } from "./accounts-api"
import type { Account } from "./account-types"

vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ getToken: vi.fn() }) }))
vi.mock("./accounts-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./accounts-api")>()),
  adjustAccountBalance: vi.fn()
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))
const account: Account = {
  id: "account-1",
  name: "Bank",
  type: "BANK",
  currency: "PKR",
  currentBalance: "100.1",
  openingBalance: "50",
  openedAt: "2026-01-01",
  archivedAt: null,
  transactionCount: 1,
  canDelete: false,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01"
}
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  })
  const invalidate = vi.spyOn(client, "invalidateQueries")
  const onClose = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <AdjustBalanceDialog account={account} onClose={onClose} />
    </QueryClientProvider>
  )
  return { onClose, invalidate }
}
afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())
describe("AdjustBalanceDialog", () => {
  it("previews the signed difference and submits the target with a balance snapshot", async () => {
    vi.mocked(adjustAccountBalance).mockResolvedValue({
      ...account,
      currentBalance: "90.05"
    })
    const { onClose, invalidate } = setup()
    expect(screen.getByRole("button", { name: "Save balance" })).toBeDisabled()
    fireEvent.change(screen.getByLabelText("New current balance (PKR)"), {
      target: { value: "90.05" }
    })
    expect(screen.getByRole("status")).toHaveTextContent("-10.05 PKR")
    fireEvent.click(screen.getByRole("button", { name: "Save balance" }))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(adjustAccountBalance).toHaveBeenCalledWith(
      expect.any(Function),
      account.id,
      {
        currentBalance: "90.05",
        expectedBalance: "100.1",
        currency: "PKR",
        idempotencyKey: expect.any(String)
      }
    )
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["accounts"] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["transactions"] })
  })
  it("shows errors and preserves the key across retries", async () => {
    vi.mocked(adjustAccountBalance).mockRejectedValue(
      new Error("The account changed.")
    )
    const { onClose } = setup()
    fireEvent.change(screen.getByLabelText("New current balance (PKR)"), {
      target: { value: "110.2" }
    })
    expect(screen.getByRole("status")).toHaveTextContent("+10.1 PKR")
    fireEvent.click(screen.getByRole("button", { name: "Save balance" }))
    await screen.findByText("The account changed.")
    fireEvent.click(screen.getByRole("button", { name: "Save balance" }))
    await waitFor(() => expect(adjustAccountBalance).toHaveBeenCalledTimes(2))
    const calls = vi.mocked(adjustAccountBalance).mock.calls
    expect(calls[0][2].idempotencyKey).toBe(calls[1][2].idempotencyKey)
    expect(onClose).not.toHaveBeenCalled()
  })
  it.each(["", "NaN", "1e3", "1.123456789", "10000000000000000"])(
    "rejects invalid input %s",
    async (value) => {
      setup()
      fireEvent.change(screen.getByLabelText("New current balance (PKR)"), {
        target: { value }
      })
      fireEvent.click(screen.getByRole("button", { name: "Save balance" }))
      await screen.findByText(
        "Enter a balance with up to 16 integer digits and 8 decimal places."
      )
      expect(adjustAccountBalance).not.toHaveBeenCalled()
    }
  )
})
