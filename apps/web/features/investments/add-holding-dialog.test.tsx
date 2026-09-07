import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AddHoldingDialog } from "./add-holding-dialog"

vi.mock("@/features/accounts/accounts-api", () => ({ listAccounts: vi.fn().mockResolvedValue([]) }))
vi.mock("@/features/portfolios/portfolios-api", () => ({ listPortfolios: vi.fn().mockResolvedValue([]) }))
vi.mock("@/features/settings/settings-api", () => ({ settingsQueryKey: ["settings"], getSettings: vi.fn().mockResolvedValue({ baseCurrency: "USD", exchangeRate: "275" }) }))
vi.mock("@/features/assets/assets-api", () => ({
  listAssets: vi.fn().mockResolvedValue([]),
  getAssetMetadata: vi.fn().mockResolvedValue({ categories: [{ id: "00000000-0000-4000-8000-000000000001", name: "Stock", order: 1 }], riskProfiles: [] }),
  searchMarketAssets: vi.fn().mockResolvedValue([{ name: "Apple Inc.", symbol: "AAPL", type: "STOCK", provider: "FINNHUB", providerAssetId: "AAPL", exchange: "US", imageUrl: null, quoteCurrency: "USD" }]),
}))
vi.mock("./investments-api", () => ({ createPosition: vi.fn(), listHoldings: vi.fn().mockResolvedValue([]) }))

function renderDialog() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AddHoldingDialog domain="SECURITIES" getToken={vi.fn().mockResolvedValue("token")} open onOpenChange={vi.fn()} /></QueryClientProvider>)
}

describe("AddHoldingDialog", () => {
  afterEach(cleanup)

  it("offers a dedicated stablecoin opening-balance flow", () => {
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AddHoldingDialog domain="CRYPTO" cashEquivalentOnly getToken={vi.fn().mockResolvedValue("token")} open onOpenChange={vi.fn()} /></QueryClientProvider>)
    expect(screen.getByRole("heading", { name: "Add stablecoin balance" })).toBeInTheDocument()
    expect(screen.getByText("Crypto stablecoins")).toBeInTheDocument()
  })

  it("keeps the user in the wizard for a provider-backed asset", async () => {
    renderDialog()
    fireEvent.change(screen.getByPlaceholderText("Search name or symbol"), { target: { value: "Apple" } })
    fireEvent.click(await screen.findByRole("button", { name: /Apple Inc/i }, { timeout: 1500 }))
    expect(screen.getByText("I already own it")).toBeInTheDocument()
    expect(screen.getByText(/priced in USD/i)).toBeInTheDocument()
  })

  it("supports manual assets without leaving Investments", async () => {
    renderDialog()
    fireEvent.click(screen.getByRole("button", { name: "Manual entry" }))
    expect(screen.getByText("Current price (optional)")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled()
  })
})
