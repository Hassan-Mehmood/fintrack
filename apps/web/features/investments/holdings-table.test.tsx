import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { HoldingsTable } from "./holdings-table";
import type { Holding } from "./investment-types";

afterEach(cleanup);

describe("HoldingsTable", () => {
  it("shows account currency, native values, and position actions", async () => {
    const user = userEvent.setup();
    render(
      <HoldingsTable
        groupBy="ACCOUNT"
        holdings={[holding]}
        reportingCurrency="PKR"
      />,
    );

    expect(screen.getAllByText("Brokerage · PKR").length).toBeGreaterThan(0);
    expect(screen.getByText("PKR")).toBeInTheDocument();
    expect(screen.getAllByText("Native: USD 100.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Native: USD 120.00").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Buy more" })).toHaveAttribute(
      "href",
      "/transactions?action=INVESTMENT_BUY&accountId=account-1&assetId=asset-1",
    );
    expect(screen.getByRole("link", { name: "Sell" })).toHaveAttribute(
      "href",
      "/transactions?action=INVESTMENT_SELL&accountId=account-1&assetId=asset-1",
    );

    await user.click(
      screen.getByRole("button", { name: "More holding actions" }),
    );
    expect(
      screen.getByRole("menuitem", { name: "Dividend" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Stock split" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Asset withdrawal" }),
    ).toBeInTheDocument();
  });

  it("renders balance-backed cash without investment P&L actions", () => {
    render(
      <HoldingsTable
        groupBy="NONE"
        holdings={[cashHolding]}
        reportingCurrency="USD"
      />,
    );

    expect(screen.getByText("Account ledger")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage cash" })).toHaveAttribute(
      "href",
      "/accounts/account-1",
    );
    expect(
      screen.queryByRole("link", { name: "Buy more" }),
    ).not.toBeInTheDocument();
  });
});

const holding: Holding = {
  holdingKind: "ASSET",
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
  positionStatus: "ACTIVE",
  liquidityClass: "INVESTMENT",
  liquidityClassSource: "AUTO",
};

const cashHolding: Holding = {
  ...holding,
  holdingKind: "FIAT_CASH",
  assetId: "fiat-cash:account-1:total",
  assetName: "Cash",
  assetSymbol: "USD",
  categoryName: "Cash",
  accountCurrency: "USD",
  quantity: "1000",
  nativeCurrency: "USD",
  nativeAverageCost: null,
  nativeCurrentPrice: "1",
  nativeCostBasis: null,
  nativeCurrentValue: "1000",
  nativeRealizedGain: null,
  nativeUnrealizedGain: null,
  reportingCurrency: "USD",
  averageCost: null,
  currentPrice: "1",
  costBasis: null,
  currentValue: "1000",
  realizedGain: null,
  unrealizedGain: null,
  unrealizedGainPercent: null,
  liquidityClass: "FIAT_CASH",
};
