import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AddAssetDialog } from "./add-asset-dialog";
import { searchMarketAssets } from "./assets-api";
import type { MarketSearchResult } from "./asset-types";

vi.mock("./assets-api", () => ({
  searchMarketAssets: vi.fn(),
}));

const mockedSearch = vi.mocked(searchMarketAssets);

afterEach(() => {
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
});

function renderDialog({
  onAddProviderAsset = vi.fn().mockResolvedValue(undefined),
}: {
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
        isPending={false}
        onAddProviderAsset={onAddProviderAsset}
        onManualAsset={() => undefined}
        onOpenChange={() => undefined}
      />
    </QueryClientProvider>,
  );
}
