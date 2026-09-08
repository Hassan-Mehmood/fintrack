import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AccountFormDialog } from "./account-form-dialog"

afterEach(cleanup)

describe("AccountFormDialog", () => {
  it("uses stablecoins instead of a fiat opening balance for crypto wallets", () => {
    render(
      <AccountFormDialog
        allowedAccountTypes={["CRYPTO_WALLET"]}
        mode="create"
        onOpenChange={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        open
      />,
    )

    expect(screen.queryByLabelText("Opening balance")).not.toBeInTheDocument()
    expect(screen.getByText("Liquid balance")).toBeInTheDocument()
    expect(
      screen.getByText(/Add USDC, USDT, DAI/),
    ).toBeInTheDocument()
  })
})
