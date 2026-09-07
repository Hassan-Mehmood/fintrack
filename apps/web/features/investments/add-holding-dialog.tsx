"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, SearchIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { listAccounts } from "@/features/accounts/accounts-api";
import type { Account } from "@/features/accounts/account-types";
import {
  getAssetMetadata,
  listAssets,
  searchMarketAssets,
} from "@/features/assets/assets-api";
import type { Asset, MarketSearchResult } from "@/features/assets/asset-types";
import { listPortfolios } from "@/features/portfolios/portfolios-api";
import { formatAmount } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import {
  getSettings,
  settingsQueryKey,
} from "@/features/settings/settings-api";

import { createPosition, listHoldings } from "./investments-api";
import type {
  CreatePositionPayload,
  InvestmentDomain,
  PositionAssetInput,
} from "./investment-types";

interface AddHoldingDialogProps {
  readonly domain: InvestmentDomain;
  readonly cashEquivalentOnly?: boolean;
  readonly getToken: () => Promise<string | null>;
  readonly initialAccountId?: string;
  readonly lockAccount?: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly portfolioSetup?: boolean;
}

type SelectedAsset = {
  readonly input: PositionAssetInput;
  readonly label: string;
  readonly symbol: string | null;
  readonly marketType: "STOCK" | "CRYPTO" | null;
  readonly priceCurrency: "USD" | "PKR";
  readonly currentPrice?: string | null;
  readonly providerBacked: boolean;
};

export function AddHoldingDialog({
  cashEquivalentOnly = false,
  domain,
  getToken,
  initialAccountId,
  lockAccount = false,
  onOpenChange,
  open,
  portfolioSetup = false,
}: AddHoldingDialogProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [market, setMarket] = useState<"US" | "PSX" | "CRYPTO">(
    domain === "CRYPTO" || cashEquivalentOnly ? "CRYPTO" : "US",
  );
  const [manual, setManual] = useState(false);
  const [selected, setSelected] = useState<SelectedAsset | null>(null);
  const [manualName, setManualName] = useState("");
  const [manualSymbol, setManualSymbol] = useState("");
  const [manualCategoryId, setManualCategoryId] = useState("");
  const [manualCurrency, setManualCurrency] = useState<"USD" | "PKR">("USD");
  const [manualPrice, setManualPrice] = useState("");
  const [mode, setMode] = useState<"OPENING" | "BUY">("OPENING");
  const [accountChoice, setAccountChoice] = useState(
    initialAccountId ?? (portfolioSetup ? "NEW" : ""),
  );
  const [newAccountName, setNewAccountName] = useState("");
  const [accountCurrency, setAccountCurrency] = useState<"USD" | "PKR">("USD");
  const [accountCash, setAccountCash] = useState("0");
  const [quantity, setQuantity] = useState("");
  const [costInput, setCostInput] = useState<"UNIT" | "TOTAL">("UNIT");
  const [price, setPrice] = useState("");
  const [currentValue, setCurrentValue] = useState("");
  const [fees, setFees] = useState("0");
  const [settlementAssetId, setSettlementAssetId] = useState("");
  const [date, setDate] = useState(today());
  const [fxRate, setFxRate] = useState("");
  const [portfolioChoice, setPortfolioChoice] = useState(
    portfolioSetup ? "NEW" : "NONE",
  );
  const [newPortfolioName, setNewPortfolioName] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  const accountsQuery = useQuery({
    queryKey: ["accounts"],
    queryFn: () => listAccounts(getToken, domain),
    enabled: open,
  });
  const assetsQuery = useQuery({
    queryKey: ["assets"],
    queryFn: () => listAssets(getToken, domain),
    enabled: open,
  });
  const metadataQuery = useQuery({
    queryKey: ["assets", "metadata"],
    queryFn: () => getAssetMetadata(getToken),
    enabled: open,
  });
  const portfoliosQuery = useQuery({
    queryKey: ["portfolios"],
    queryFn: () => listPortfolios(getToken, domain),
    enabled: open,
  });
  const settingsQuery = useQuery({
    queryKey: settingsQueryKey,
    queryFn: () => getSettings(getToken),
    enabled: open,
  });
  const holdingsQuery = useQuery({
    queryKey: ["investments", "holdings", "NATIVE"],
    queryFn: () => listHoldings(getToken, "NATIVE", { domain }),
    enabled: open,
  });
  const searchQuery = useQuery({
    queryKey: ["market-data", "position-search", market, debouncedQuery],
    queryFn: ({ signal }) =>
      searchMarketAssets(
        getToken,
        market === "CRYPTO" ? "CRYPTO" : "STOCK",
        debouncedQuery,
        signal,
        market === "CRYPTO" ? undefined : market,
      ),
    enabled: open && step === 1 && !manual && debouncedQuery.length >= 2,
    retry: false,
  });

  const compatibleAccounts = useMemo(
    () =>
      (accountsQuery.data ?? []).filter((account) =>
        isCompatible(account, selected?.marketType ?? null),
      ),
    [accountsQuery.data, selected?.marketType],
  );
  const settlementHoldings = useMemo(
    () =>
      (holdingsQuery.data ?? []).filter(
        (holding) =>
          holding.accountId === accountChoice &&
          holding.liquidityClass === "CASH_EQUIVALENT" &&
          holding.nativeCurrency === "USD" &&
          number(holding.quantity) > 0 &&
          holding.assetId !==
            (selected?.input.kind === "EXISTING"
              ? selected.input.assetId
              : undefined),
      ),
    [accountChoice, holdingsQuery.data, selected],
  );

  const mutation = useMutation({
    mutationFn: (payload: CreatePositionPayload) =>
      createPosition(getToken, payload),
    onSuccess: async (result) => {
      setAccountChoice(result.accountId);
      setPortfolioChoice(result.portfolioId ?? "NONE");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["investments"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["assets"] }),
        queryClient.invalidateQueries({ queryKey: ["portfolios"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
      setStep(4);
    },
  });

  const nativeCost =
    mode === "OPENING" && costInput === "TOTAL"
      ? number(price)
      : number(quantity) * number(price);
  const selectedAccount = compatibleAccounts.find(
    (account) => account.id === accountChoice,
  );
  const effectiveAccountCurrency =
    accountChoice === "NEW"
      ? accountCurrency
      : (selectedAccount?.currency ?? accountCurrency);
  const effectiveFxRate = fxRate || settingsQuery.data?.exchangeRate || "";
  const isCryptoPurchase =
    mode === "BUY" &&
    (selected?.marketType === "CRYPTO" ||
      selectedAccount?.type === "CRYPTO_WALLET");
  const convertedGross =
    !isCryptoPurchase &&
    selected &&
    selected.priceCurrency !== effectiveAccountCurrency &&
    number(effectiveFxRate) > 0
      ? selected.priceCurrency === "USD"
        ? nativeCost * number(effectiveFxRate)
        : nativeCost / number(effectiveFxRate)
      : nativeCost;
  const cashImpact = mode === "BUY" ? convertedGross + number(fees) : 0;
  const startingCash =
    accountChoice === "NEW"
      ? number(accountCash)
      : number(selectedAccount?.currentBalance);
  const accountTotal =
    startingCash -
    (isCryptoPurchase ? 0 : cashImpact) +
    (selected?.currentPrice
      ? number(quantity) * number(selected.currentPrice)
      : 0);

  function close(nextOpen: boolean) {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

  function reset() {
    setStep(1);
    setQuery("");
    setMarket(domain === "CRYPTO" || cashEquivalentOnly ? "CRYPTO" : "US");
    setSelected(null);
    setManual(false);
    setManualName("");
    setManualSymbol("");
    setQuantity("");
    setPrice("");
    setCurrentValue("");
    setFees("0");
    setSettlementAssetId("");
    setAccountChoice(initialAccountId ?? (portfolioSetup ? "NEW" : ""));
    setPortfolioChoice(portfolioSetup ? "NEW" : "NONE");
    setNewAccountName("");
    setNewPortfolioName("");
    mutation.reset();
  }

  function addAnotherHolding() {
    setStep(1);
    setQuery("");
    setSelected(null);
    setManual(false);
    setManualName("");
    setManualSymbol("");
    setManualPrice("");
    setQuantity("");
    setPrice("");
    setCurrentValue("");
    setFees("0");
    setSettlementAssetId("");
    setMode("OPENING");
    mutation.reset();
  }

  function selectProvider(result: MarketSearchResult) {
    setSelected({
      input: {
        kind: "PROVIDER",
        type: result.type,
        provider: result.provider,
        providerAssetId: result.providerAssetId,
      },
      label: result.name,
      symbol: result.symbol,
      marketType: result.type,
      priceCurrency: result.quoteCurrency,
      providerBacked: true,
    });
    setAccountCurrency(result.quoteCurrency);
    if (cashEquivalentOnly) {
      setMode("OPENING");
      setPrice("1");
    }
    preselectAccount(result.type);
    setStep(2);
  }

  function selectExisting(asset: Asset) {
    if (!asset.priceCurrency) return;
    setSelected({
      input: { kind: "EXISTING", assetId: asset.id },
      label: asset.name,
      symbol: asset.symbol,
      marketType: asset.marketType,
      priceCurrency: asset.priceCurrency as "USD" | "PKR",
      currentPrice: asset.currentPrice,
      providerBacked: asset.provider !== null,
    });
    setPrice(cashEquivalentOnly ? "1" : "");
    preselectAccount(asset.marketType);
    setStep(2);
  }

  function selectManual() {
    if (!manualName.trim() || !manualCategoryId) return;
    setSelected({
      input: {
        kind: "MANUAL",
        name: manualName.trim(),
        symbol: manualSymbol.trim() || undefined,
        categoryId: manualCategoryId,
        currentPrice: manualPrice || undefined,
        priceCurrency: manualCurrency,
      },
      label: manualName.trim(),
      symbol: manualSymbol.trim() || null,
      marketType: null,
      priceCurrency: manualCurrency,
      currentPrice: manualPrice || null,
      providerBacked: false,
    });
    setPrice("");
    setAccountCurrency(manualCurrency);
    preselectAccount(null);
    setStep(2);
  }

  function preselectAccount(marketType: "STOCK" | "CRYPTO" | null) {
    if (portfolioSetup) return;
    const matches = (accountsQuery.data ?? []).filter((account) =>
      isCompatible(account, marketType),
    );
    if (matches.length === 1) {
      setAccountChoice(matches[0].id);
      setAccountCurrency(matches[0].currency as "USD" | "PKR");
    }
  }

  function submit() {
    if (!selected) return;
    const account: CreatePositionPayload["account"] =
      accountChoice === "NEW"
        ? {
            kind: "NEW",
            name: newAccountName.trim(),
            currency: accountCurrency,
            openingBalance: accountCash || "0",
          }
        : { kind: "EXISTING", accountId: accountChoice };
    const portfolio: CreatePositionPayload["portfolio"] =
      portfolioChoice === "NONE"
        ? undefined
        : portfolioChoice === "NEW"
          ? { kind: "NEW", name: newPortfolioName.trim() }
          : { kind: "EXISTING", portfolioId: portfolioChoice };
    mutation.mutate({
      domain,
      idempotencyKey: crypto.randomUUID(),
      mode,
      asset: selected.input,
      account,
      quantity,
      costInput,
      unitCost: mode === "OPENING" && costInput === "UNIT" ? price : undefined,
      totalCost:
        mode === "OPENING" && costInput === "TOTAL" ? price : undefined,
      unitPrice: mode === "BUY" ? price : undefined,
      currentValue:
        mode === "OPENING" && currentValue ? currentValue : undefined,
      fees: mode === "BUY" ? fees || "0" : "0",
      historicalFxRate: effectiveFxRate || undefined,
      settlementAsset: isCryptoPurchase
        ? { kind: "EXISTING", assetId: settlementAssetId }
        : undefined,
      occurredAt: new Date(`${date}T12:00:00`).toISOString(),
      portfolio:
        portfolioSetup && portfolioChoice === "NEW"
          ? { kind: "NEW", name: newAccountName.trim() }
          : portfolio,
    });
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none">
        <DialogHeader>
          <DialogTitle>
            {step === 4
              ? portfolioSetup
                ? "Opening balance saved"
                : "Holding added"
              : cashEquivalentOnly
                ? "Add stablecoin balance"
                : portfolioSetup
                  ? "Set up existing portfolio"
                  : "Add holding"}
          </DialogTitle>
          <DialogDescription>
            {step < 4
              ? `Step ${step} of 3 · ${["Choose asset", "Enter position", "Organize and confirm"][step - 1]}`
              : "Your investments are up to date."}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="grid gap-4">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={!manual ? "default" : "outline"}
                onClick={() => setManual(false)}
              >
                Market or library
              </Button>
              {!cashEquivalentOnly ? (
                <Button
                  size="sm"
                  variant={manual ? "default" : "outline"}
                  onClick={() => setManual(true)}
                >
                  Manual entry
                </Button>
              ) : null}
            </div>
            {manual ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Name</FieldLabel>
                  <Input
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel>Symbol</FieldLabel>
                  <Input
                    value={manualSymbol}
                    onChange={(e) => setManualSymbol(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel>Category</FieldLabel>
                  <Select
                    value={manualCategoryId}
                    onValueChange={setManualCategoryId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {metadataQuery.data?.categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>Price currency</FieldLabel>
                  <Select
                    value={manualCurrency}
                    onValueChange={(v) => setManualCurrency(v as "USD" | "PKR")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="PKR">PKR</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {!portfolioSetup ? (
                  <Field>
                    <FieldLabel>Current price (optional)</FieldLabel>
                    <Input
                      inputMode="decimal"
                      value={manualPrice}
                      onChange={(e) => setManualPrice(e.target.value)}
                    />
                  </Field>
                ) : null}
                <div className="flex items-end">
                  <Button
                    className="w-full"
                    disabled={!manualName.trim() || !manualCategoryId}
                    onClick={selectManual}
                  >
                    Continue
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
                  {cashEquivalentOnly ? (
                    <div className="flex items-center rounded-md border px-3 text-sm">
                      Crypto stablecoins
                    </div>
                  ) : (
                    <Select
                      value={market}
                      onValueChange={(v) => setMarket(v as typeof market)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {domain === "SECURITIES" ? (
                          <>
                            <SelectItem value="US">US stocks</SelectItem>
                            <SelectItem value="PSX">PSX stocks/ETFs</SelectItem>
                          </>
                        ) : (
                          <SelectItem value="CRYPTO">Crypto</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  )}
                  <div className="relative">
                    <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Search name or symbol"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                </div>
                {(assetsQuery.data ?? [])
                  .filter(
                    (asset) =>
                      (!cashEquivalentOnly ||
                        asset.liquidityClass === "CASH_EQUIVALENT") &&
                      (query.length < 2 ||
                        `${asset.name} ${asset.symbol ?? ""}`
                          .toLowerCase()
                          .includes(query.toLowerCase())),
                  )
                  .slice(0, 5)
                  .map((asset) => (
                    <AssetRow
                      key={asset.id}
                      title={asset.name}
                      subtitle={`${asset.symbol ?? "Manual asset"} · Your asset library`}
                      onClick={() => selectExisting(asset)}
                    />
                  ))}
                {searchQuery.isFetching ? (
                  <div className="flex justify-center py-6">
                    <Spinner />
                  </div>
                ) : searchQuery.isError ? (
                  <Alert variant="destructive">
                    <AlertTitle>Search failed</AlertTitle>
                    <AlertDescription>
                      {searchQuery.error.message} Your entries are preserved;
                      retry or use manual entry.
                    </AlertDescription>
                  </Alert>
                ) : (
                  searchQuery.data
                    ?.filter(
                      (asset) =>
                        !cashEquivalentOnly ||
                        CASH_EQUIVALENT_IDS.has(asset.providerAssetId),
                    )
                    .map((asset) => (
                      <AssetRow
                        key={`${asset.provider}:${asset.providerAssetId}`}
                        title={asset.name}
                        subtitle={`${asset.symbol} · ${asset.exchange ?? asset.type}`}
                        onClick={() => selectProvider(asset)}
                      />
                    ))
                )}
              </>
            )}
          </div>
        ) : null}

        {step === 2 && selected ? (
          <div className="grid gap-4">
            <div className="rounded-lg border p-3">
              <p className="font-medium">{selected.label}</p>
              <p className="text-xs text-muted-foreground">
                {selected.symbol ?? "Manual investment"} · priced in{" "}
                {selected.priceCurrency}
              </p>
            </div>
            {!cashEquivalentOnly && !portfolioSetup ? (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={mode === "OPENING" ? "default" : "outline"}
                  onClick={() => setMode("OPENING")}
                >
                  I already own it
                </Button>
                <Button
                  variant={mode === "BUY" ? "default" : "outline"}
                  onClick={() => setMode("BUY")}
                >
                  Record a new purchase
                </Button>
              </div>
            ) : portfolioSetup ? (
              <p className="text-sm text-muted-foreground">
                Enter this asset as an opening balance. It will not create a
                historical buy or change wallet cash.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Enter the stablecoin amount currently remaining in this wallet.
                This opening balance does not change fiat cash.
              </p>
            )}
            {!portfolioSetup ? (
              <Field>
                <FieldLabel>Investment account</FieldLabel>
                <Select
                  disabled={lockAccount}
                  value={accountChoice}
                  onValueChange={(value) => {
                    setAccountChoice(value);
                    const account = compatibleAccounts.find(
                      (item) => item.id === value,
                    );
                    if (account)
                      setAccountCurrency(account.currency as "USD" | "PKR");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select or create account" />
                  </SelectTrigger>
                  <SelectContent>
                    {compatibleAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name} · {account.currency}
                      </SelectItem>
                    ))}
                    {!lockAccount ? (
                      <SelectItem value="NEW">+ Create account</SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            {accountChoice === "NEW" ? (
              <div
                className={cn(
                  "grid gap-3",
                  portfolioSetup ? "sm:grid-cols-2" : "sm:grid-cols-3",
                )}
              >
                <Field>
                  <FieldLabel>
                    {portfolioSetup ? "Portfolio name" : "Account name"}
                  </FieldLabel>
                  <Input
                    value={newAccountName}
                    onChange={(e) => setNewAccountName(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel>
                    {portfolioSetup ? "Base currency" : "Currency"}
                  </FieldLabel>
                  <Select
                    value={accountCurrency}
                    onValueChange={(v) =>
                      setAccountCurrency(v as "USD" | "PKR")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="PKR">PKR</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {!portfolioSetup ? (
                  <Field>
                    <FieldLabel>Uninvested cash</FieldLabel>
                    <Input
                      inputMode="decimal"
                      value={accountCash}
                      onChange={(e) => setAccountCash(e.target.value)}
                    />
                  </Field>
                ) : null}
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel>Quantity</FieldLabel>
                <Input
                  inputMode="decimal"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel>
                  {mode === "BUY"
                    ? `Unit price (${selected.priceCurrency})`
                    : costInput === "UNIT"
                      ? `Average purchase price (optional, ${selected.priceCurrency})`
                      : `Total purchase cost (optional, ${selected.priceCurrency})`}
                </FieldLabel>
                <Input
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </Field>
            </div>
            {mode === "OPENING" ? (
              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={costInput === "UNIT" ? "secondary" : "outline"}
                    onClick={() => setCostInput("UNIT")}
                  >
                    Average cost
                  </Button>
                  <Button
                    size="sm"
                    variant={costInput === "TOTAL" ? "secondary" : "outline"}
                    onClick={() => setCostInput("TOTAL")}
                  >
                    Total cost
                  </Button>
                </div>
                {!selected.providerBacked ? (
                  <Field>
                    <FieldLabel>
                      Current total value (optional, {selected.priceCurrency})
                    </FieldLabel>
                    <Input
                      inputMode="decimal"
                      value={currentValue}
                      onChange={(event) => setCurrentValue(event.target.value)}
                    />
                  </Field>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Current value will be calculated from the provider market
                    price after saving.
                  </p>
                )}
              </div>
            ) : (
              <Field>
                <FieldLabel>
                  Fees (
                  {isCryptoPurchase
                    ? (settlementHoldings.find(
                        (holding) => holding.assetId === settlementAssetId,
                      )?.assetSymbol ?? "stablecoin")
                    : effectiveAccountCurrency}
                  )
                </FieldLabel>
                <Input
                  inputMode="decimal"
                  value={fees}
                  onChange={(e) => setFees(e.target.value)}
                />
              </Field>
            )}
            {isCryptoPurchase ? (
              <Field>
                <FieldLabel>Pay with</FieldLabel>
                <Select
                  value={settlementAssetId}
                  onValueChange={setSettlementAssetId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a stablecoin" />
                  </SelectTrigger>
                  <SelectContent>
                    {settlementHoldings.map((holding) => (
                      <SelectItem key={holding.assetId} value={holding.assetId}>
                        {holding.assetSymbol ?? holding.assetName} ·{" "}
                        {holding.quantity} available
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {settlementHoldings.length === 0 ? (
                  <p className="text-sm text-destructive">
                    Add a USDT, USDC, or other cash-equivalent opening balance
                    to this wallet before recording a purchase.
                  </p>
                ) : null}
              </Field>
            ) : mode === "BUY" ? (
              <p className="text-sm text-muted-foreground">
                Paid with Cash ·{" "}
                {formatAmount(String(startingCash), effectiveAccountCurrency)}{" "}
                available
              </p>
            ) : null}
            <Field>
              <FieldLabel>
                {mode === "OPENING" ? "Acquisition date" : "Purchase date"}
              </FieldLabel>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            {price && selected.priceCurrency !== effectiveAccountCurrency ? (
              <Field>
                <FieldLabel>Historical USD/PKR rate</FieldLabel>
                <Input
                  inputMode="decimal"
                  value={fxRate}
                  onChange={(e) => setFxRate(e.target.value)}
                  placeholder={settingsQuery.data?.exchangeRate ?? "Required"}
                />
                <p className="text-xs text-muted-foreground">
                  Leave unchanged to use the current configured rate.
                </p>
              </Field>
            ) : null}
          </div>
        ) : null}

        {step === 3 && selected ? (
          <div className="grid gap-4">
            <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
              <Summary label="Resulting quantity" value={quantity || "—"} />
              <Summary
                label="Cost basis"
                value={
                  price
                    ? formatAmount(String(nativeCost), selected.priceCurrency)
                    : "Not provided"
                }
              />
              <Summary
                label="Current value"
                value={
                  currentValue
                    ? formatAmount(currentValue, selected.priceCurrency)
                    : selected.currentPrice
                      ? formatAmount(
                          String(
                            number(quantity) * number(selected.currentPrice),
                          ),
                          selected.priceCurrency,
                        )
                      : "Price unavailable"
                }
              />
              <Summary
                label={
                  isCryptoPurchase ? "Stablecoin impact" : "Account cash impact"
                }
                value={
                  mode === "OPENING"
                    ? "No cash impact"
                    : isCryptoPurchase
                      ? `− ${cashImpact} ${settlementHoldings.find((holding) => holding.assetId === settlementAssetId)?.assetSymbol ?? "stablecoin"}`
                      : `− ${formatAmount(String(cashImpact), effectiveAccountCurrency)}`
                }
              />
              {isCryptoPurchase ? (
                <Summary
                  label="Pair"
                  value={`${selected.symbol ?? selected.label}/${settlementHoldings.find((holding) => holding.assetId === settlementAssetId)?.assetSymbol ?? "—"}`}
                />
              ) : (
                <Summary
                  label="Estimated account total"
                  value={formatAmount(
                    String(accountTotal),
                    effectiveAccountCurrency,
                  )}
                />
              )}
            </div>
            {!portfolioSetup ? (
              <Field>
                <FieldLabel>Portfolio (optional)</FieldLabel>
                <Select
                  value={portfolioChoice}
                  onValueChange={setPortfolioChoice}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">No custom portfolio</SelectItem>
                    {portfoliosQuery.data?.map((portfolio) => (
                      <SelectItem key={portfolio.id} value={portfolio.id}>
                        {portfolio.name}
                      </SelectItem>
                    ))}
                    <SelectItem value="NEW">+ Create portfolio</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            ) : (
              <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
                <Summary label="Portfolio" value={newAccountName} />
                <Summary label="Base currency" value={accountCurrency} />
              </div>
            )}
            {!portfolioSetup && portfolioChoice === "NEW" ? (
              <Field>
                <FieldLabel>Portfolio name</FieldLabel>
                <Input
                  value={newPortfolioName}
                  onChange={(e) => setNewPortfolioName(e.target.value)}
                />
              </Field>
            ) : null}
            {mutation.isError ? (
              <Alert variant="destructive">
                <AlertTitle>Unable to add holding</AlertTitle>
                <AlertDescription>{mutation.error.message}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        ) : null}

        {step === 4 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-success/10 text-success">
              <CheckIcon />
            </span>
            <p className="text-lg font-medium">
              {portfolioSetup
                ? "Opening balance saved"
                : "Holding added successfully"}
            </p>
            <p className="text-muted-foreground">
              Balances, performance, and portfolio membership have been
              refreshed.
            </p>
          </div>
        ) : null}

        <DialogFooter className={cn(step === 4 && "sm:justify-between")}>
          {step === 4 ? (
            <>
              <Button variant="outline" onClick={addAnotherHolding}>
                {portfolioSetup ? "Add another asset" : "Add another holding"}
              </Button>
              <Button onClick={() => close(false)}>
                View {domain === "CRYPTO" ? "crypto" : "stocks"}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => (step === 1 ? close(false) : setStep(step - 1))}
              >
                Back
              </Button>
              {step === 2 ? (
                <Button
                  disabled={
                    !canContinuePosition({
                      accountChoice,
                      newAccountName,
                      quantity,
                      price,
                      priceRequired: mode === "BUY",
                      currentValue,
                      fxRequired:
                        selected?.priceCurrency !== effectiveAccountCurrency &&
                        !isCryptoPurchase &&
                        Boolean(price),
                      fxRate: effectiveFxRate,
                      settlementRequired: isCryptoPurchase,
                      settlementAssetId,
                    })
                  }
                  onClick={() => setStep(3)}
                >
                  Review
                </Button>
              ) : step === 3 ? (
                <Button
                  disabled={
                    mutation.isPending ||
                    (portfolioSetup && !newAccountName.trim()) ||
                    (!portfolioSetup &&
                      portfolioChoice === "NEW" &&
                      !newPortfolioName.trim())
                  }
                  onClick={submit}
                >
                  {mutation.isPending ? <Spinner /> : null}Add holding
                </Button>
              ) : null}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssetRow({
  title,
  subtitle,
  onClick,
}: {
  readonly title: string;
  readonly subtitle: string;
  readonly onClick: () => void;
}) {
  return (
    <Button
      variant="outline"
      className="h-auto justify-start py-3 text-left"
      onClick={onClick}
    >
      <span className="min-w-0">
        <span className="block truncate font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {subtitle}
        </span>
      </span>
    </Button>
  );
}

function Summary({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-mono font-medium">{value}</p>
    </div>
  );
}

function isCompatible(account: Account, marketType: "STOCK" | "CRYPTO" | null) {
  return marketType === "CRYPTO"
    ? account.type === "CRYPTO_WALLET"
    : marketType === "STOCK"
      ? account.type === "BROKER"
      : account.type === "BROKER" || account.type === "CRYPTO_WALLET";
}

function canContinuePosition(input: {
  accountChoice: string;
  newAccountName: string;
  quantity: string;
  price: string;
  priceRequired: boolean;
  currentValue: string;
  fxRequired: boolean;
  fxRate: string;
  settlementRequired: boolean;
  settlementAssetId: string;
}) {
  return Boolean(
    input.accountChoice &&
    (input.accountChoice !== "NEW" || input.newAccountName.trim()) &&
    number(input.quantity) > 0 &&
    (!input.priceRequired || number(input.price) > 0) &&
    (!input.price || number(input.price) > 0) &&
    (!input.currentValue || number(input.currentValue) > 0) &&
    (!input.fxRequired || number(input.fxRate) > 0) &&
    (!input.settlementRequired || input.settlementAssetId),
  );
}

function number(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const CASH_EQUIVALENT_IDS = new Set([
  "tether",
  "usd-coin",
  "dai",
  "binance-usd",
  "true-usd",
  "first-digital-usd",
  "paypal-usd",
  "frax",
]);
