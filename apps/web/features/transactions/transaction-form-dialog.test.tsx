import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { Account } from "@/features/accounts/account-types"

import { TransactionFormDialog } from "./transaction-form-dialog"

const accounts: readonly Account[] = [
  {
    id: "account-1",
    name: "Nayapay",
    type: "DIGITAL_WALLET",
    currency: "PKR",
    openingBalance: "1000.00",
    currentBalance: "1000.00",
    openedAt: "2026-01-01",
    archivedAt: null,
    transactionCount: 0,
    canDelete: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "account-2",
    name: "ABL Bank",
    type: "BANK",
    currency: "PKR",
    openingBalance: "2000.00",
    currentBalance: "2000.00",
    openedAt: "2026-01-01",
    archivedAt: null,
    transactionCount: 0,
    canDelete: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
]

afterEach(cleanup)

describe("TransactionFormDialog", () => {
  it("stays open when an account is selected from its portaled menu", async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()

    render(
      <TransactionFormDialog
        accounts={accounts}
        assets={[]}
        mode="create"
        onOpenChange={onOpenChange}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        open
      />
    )

    await user.click(screen.getByLabelText("Account"))
    await user.click(screen.getByRole("option", { name: "Nayapay (PKR)" }))

    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("only closes the account menu when the modal is clicked", async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()

    render(
      <TransactionFormDialog
        accounts={accounts}
        assets={[]}
        mode="create"
        onOpenChange={onOpenChange}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        open
      />
    )

    const dialog = screen.getByRole("dialog")
    vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 50, y: 50, width: 500, height: 500 })
    )

    await user.click(screen.getByLabelText("Account"))
    expect(
      screen.getByRole("option", { name: "Nayapay (PKR)" })
    ).toBeInTheDocument()

    await new Promise((resolve) => setTimeout(resolve, 0))
    fireEvent.pointerDown(document.body, {
      button: 0,
      clientX: 100,
      clientY: 100,
      pointerId: 1,
      pointerType: "mouse",
    })
    fireEvent.click(document.body, { clientX: 100, clientY: 100 })

    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(dialog).toBeInTheDocument()
    expect(
      screen.queryByRole("option", { name: "Nayapay (PKR)" })
    ).not.toBeInTheDocument()
  })

  it("still closes when the backdrop is clicked", async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()

    render(
      <TransactionFormDialog
        accounts={accounts}
        assets={[]}
        mode="create"
        onOpenChange={onOpenChange}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        open
      />
    )

    const overlay = document.querySelector('[data-slot="dialog-overlay"]')
    expect(overlay).toBeInstanceOf(HTMLElement)

    await new Promise((resolve) => setTimeout(resolve, 0))
    await user.click(overlay as HTMLElement)

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
