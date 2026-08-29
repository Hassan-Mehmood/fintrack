import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { Account } from "@/features/accounts/account-types"
import type { Asset } from "@/features/assets/asset-types"
import type { Holding } from "@/features/investments/investment-types"

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

const investmentAccount: Account = {
  ...accounts[0],
  id: "00000000-0000-4000-8000-000000000003",
  name: "Broker account",
  type: "BROKER",
  currency: "USD",
}

const asset: Asset = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Acme",
  symbol: "ACME",
  provider: null,
  marketType: null,
  providerAssetId: null,
  exchange: null,
  imageUrl: null,
  categoryId: "category-1",
  categoryName: "Stocks",
  riskProfileId: null,
  riskProfileName: null,
  currentPrice: "10",
  priceCurrency: "USD",
  priceStatus: "AVAILABLE",
  priceType: "CURRENT",
  priceUpdatedAt: null,
  providerDate: null,
  providerMarketAt: null,
  priceOpen: null,
  priceHigh: null,
  priceLow: null,
  priceClose: null,
  priceAdjustedClose: null,
  priceChange: null,
  priceChangePercent: null,
  priceVolume: null,
  priceBid: null,
  priceAsk: null,
  notes: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

const holding: Holding = {
  assetId: asset.id,
  assetName: asset.name,
  assetSymbol: asset.symbol,
  categoryName: "Stocks",
  riskProfileName: null,
  accountId: investmentAccount.id,
  accountName: investmentAccount.name,
  accountCurrency: investmentAccount.currency,
  portfolios: [],
  quantity: "1.25",
  nativeCurrency: "USD",
  nativeAverageCost: "8",
  nativeCurrentPrice: "10",
  nativeCostBasis: "10",
  nativeCurrentValue: "12.5",
  nativeRealizedGain: "0",
  nativeUnrealizedGain: "2.5",
  reportingCurrency: "USD",
  averageCost: "8",
  currentPrice: "10",
  priceProvider: null,
  priceStatus: "AVAILABLE",
  priceType: "CURRENT",
  priceUpdatedAt: null,
  providerDate: null,
  providerMarketAt: null,
  priceChange: null,
  priceChangePercent: null,
  costBasis: "10",
  currentValue: "12.5",
  realizedGain: "0",
  unrealizedGain: "2.5",
  unrealizedGainPercent: 25,
  hasMissingHistoricalFx: false,
}

afterEach(cleanup)

describe("TransactionFormDialog", () => {
  it("stays open when an account is selected from its portaled menu", async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()

    render(
      <TransactionFormDialog
        accounts={accounts}
        assets={[]}
        holdings={[]}
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
        holdings={[]}
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
        holdings={[]}
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

  it("recalculates read-only buy amounts from quantity, price, and fees", async () => {
    const user = userEvent.setup()

    render(
      <TransactionFormDialog
        accounts={[investmentAccount]}
        assets={[asset]}
        holdings={[holding]}
        mode="create"
        onOpenChange={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        open
      />
    )

    await selectOption(user, "Type", "Investment buy")
    await user.type(screen.getByLabelText("Quantity"), "0.1")
    await user.type(screen.getByLabelText("Price per unit"), "0.2")
    await user.type(screen.getByLabelText("Fees"), "0.01")

    expect(screen.getByLabelText("Gross amount")).toHaveValue("0.02")
    expect(screen.getByLabelText("Total amount")).toHaveValue("0.03")
    expect(screen.getByLabelText("Total amount")).toHaveAttribute("readonly")
  })

  it("shows split quantities and hides cash fields", async () => {
    const user = userEvent.setup()

    render(
      <TransactionFormDialog
        accounts={[investmentAccount]}
        assets={[asset]}
        holdings={[holding]}
        mode="create"
        onOpenChange={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        open
      />
    )

    await selectOption(user, "Type", "Stock split")
    await selectOption(user, "Asset", "Acme (ACME)")
    await user.type(screen.getByLabelText("Split ratio"), "2")

    expect(screen.getByLabelText("Existing quantity")).toHaveValue("1.25")
    expect(screen.getByLabelText("Resulting quantity")).toHaveValue("2.5")
    expect(screen.queryByLabelText("Amount")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Fees")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Price per unit")).not.toBeInTheDocument()
  })

  it("submits category and description as separate fields", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)

    render(
      <TransactionFormDialog
        accounts={[investmentAccount]}
        assets={[]}
        holdings={[]}
        mode="create"
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
        open
      />
    )

    await selectOption(user, "Account", "Broker account (USD)")
    await user.type(screen.getByLabelText("Amount"), "25")
    await user.type(screen.getByLabelText("Category"), "Food")
    await user.type(screen.getByLabelText("Description"), "Lunch with a client")
    await user.click(
      screen.getByRole("button", { name: "Create transaction" })
    )

    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "Food",
          description: "Lunch with a client",
        })
      )
    )
  })

  it("prevents submitting a sale above the current holding", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)

    render(
      <TransactionFormDialog
        accounts={[investmentAccount]}
        assets={[asset]}
        holdings={[holding]}
        mode="create"
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
        open
      />
    )

    await selectOption(user, "Type", "Investment sell")
    await selectOption(user, "Account", "Broker account (USD)")
    await selectOption(user, "Asset", "Acme (ACME)")
    await user.type(screen.getByLabelText("Quantity"), "2")
    await user.type(screen.getByLabelText("Price per unit"), "10")
    await user.type(screen.getByLabelText("Category"), "Investment")
    await user.type(screen.getByLabelText("Description"), "Partial sale")
    await user.click(screen.getByRole("button", { name: "Create transaction" }))

    expect(
      await screen.findByText(
        "Quantity cannot exceed the current holding (1.25)."
      )
    ).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

async function selectOption(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  optionName: string
): Promise<void> {
  await user.click(screen.getByLabelText(label))
  await user.click(screen.getByRole("option", { name: optionName }))
}
