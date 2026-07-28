import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
}: {
  readonly initialMarketSelection?: "US_STOCK" | "PSX_STOCK" | "CRYPTO";
  readonly onAddProviderAsset?: (asset: MarketSearchResult) => Promise<void>;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AddAssetDialog
        open
        getToken={async () => "token"}
        initialMarketSelection={initialMarketSelection}
        isPending={false}
        onAddProviderAsset={onAddProviderAsset}
        onManualAsset={() => undefined}
        onOpenChange={() => undefined}
      />
    </QueryClientProvider>,
  );
}
