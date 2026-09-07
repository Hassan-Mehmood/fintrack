import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AddAssetDialog } from "./add-asset-dialog";
import { searchMarketAssets } from "./assets-api";
import type { MarketSearchResult } from "./asset-types";

vi.mock("./assets-api", () => ({
  searchMarketAssets: vi.fn(),
}));

const mockedSearch = vi.mocked(searchMarketAssets);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("AddAssetDialog", () => {
  it("stays open when a select is dismissed inside the dialog", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    renderDialog({ onOpenChange });

    const dialog = screen.getByRole("dialog");
    vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 50, y: 50, width: 500, height: 500 }),
    );

    await user.click(screen.getByLabelText("Asset type"));
    expect(screen.getByRole("option", { name: "US stock" })).toBeInTheDocument();

    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.pointerDown(document.body, {
      button: 0,
      clientX: 100,
      clientY: 100,
      pointerId: 1,
      pointerType: "mouse",
    });
    fireEvent.click(document.body, { clientX: 100, clientY: 100 });

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(dialog).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "US stock" }),
    ).not.toBeInTheDocument();
  });

  it("debounces market searches and preserves the provider identifier", async () => {
    mockedSearch.mockResolvedValue([
      {
        name: "Bitcoin",
        symbol: "BTC",
        type: "CRYPTO",
        provider: "COINGECKO",
        providerAssetId: "bitcoin",
        exchange: null,
        imageUrl: null,
        quoteCurrency: "USD",
      },
    ]);
    const onAddProviderAsset = vi.fn().mockResolvedValue(undefined);

    renderDialog({ onAddProviderAsset });
    fireEvent.change(screen.getByLabelText("Name or symbol"), {
      target: { value: "bitcoin" },
    });

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(mockedSearch).not.toHaveBeenCalled();

    expect(await screen.findByText("Bitcoin")).toBeInTheDocument();
    expect(mockedSearch).toHaveBeenCalledWith(
      expect.any(Function),
      "STOCK",
      "bitcoin",
      expect.any(AbortSignal),
      "US",
    );

    fireEvent.click(screen.getByRole("button", { name: /Bitcoin/i }));
    expect(onAddProviderAsset).toHaveBeenCalledWith(
      expect.objectContaining({ providerAssetId: "bitcoin" }),
    );
  });

  it("shows an explicit empty search state", async () => {
    mockedSearch.mockResolvedValue([]);
    renderDialog();

    fireEvent.change(screen.getByLabelText("Name or symbol"), {
      target: { value: "zzzz" },
    });
    expect(await screen.findByText("No matching assets")).toBeInTheDocument();
  });

  it("routes PSX searches to EODHD and preserves the canonical KAR identifier", async () => {
    mockedSearch.mockResolvedValue([
      {
        name: "Lucky Cement Limited",
        symbol: "LUCK",
        type: "STOCK",
        provider: "EODHD",
        providerAssetId: "LUCK.KAR",
        exchange: "PSX",
        imageUrl: null,
        quoteCurrency: "PKR",
      },
    ]);
    const onAddProviderAsset = vi.fn().mockResolvedValue(undefined);

    renderDialog({
      initialMarketSelection: "PSX_STOCK",
      onAddProviderAsset,
    });
    fireEvent.change(screen.getByLabelText("Name or symbol"), {
      target: { value: "LUCK" },
    });

    expect(await screen.findByText("Lucky Cement Limited")).toBeInTheDocument();
    expect(screen.queryByText("EODHD")).not.toBeInTheDocument();
    expect(screen.getByText("PSX")).toBeInTheDocument();
    expect(mockedSearch).toHaveBeenCalledWith(
      expect.any(Function),
      "STOCK",
      "LUCK",
      expect.any(AbortSignal),
      "PSX",
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Lucky Cement Limited/i }),
    );
    expect(onAddProviderAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "EODHD",
        providerAssetId: "LUCK.KAR",
      }),
    );
  });
});

function renderDialog({
  initialMarketSelection,
  onAddProviderAsset = vi.fn().mockResolvedValue(undefined),
  onOpenChange = vi.fn(),
}: {
  readonly initialMarketSelection?: "US_STOCK" | "PSX_STOCK" | "CRYPTO";
  readonly onAddProviderAsset?: (asset: MarketSearchResult) => Promise<void>;
  readonly onOpenChange?: (open: boolean) => void;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AddAssetDialog
        domain={initialMarketSelection === "CRYPTO" ? "CRYPTO" : "SECURITIES"}
        open
        getToken={async () => "token"}
        initialMarketSelection={initialMarketSelection}
        isPending={false}
        onAddProviderAsset={onAddProviderAsset}
        onManualAsset={() => undefined}
        onOpenChange={onOpenChange}
      />
    </QueryClientProvider>,
  );
}
