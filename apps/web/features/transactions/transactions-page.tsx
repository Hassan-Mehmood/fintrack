"use client";

import { useAuth } from "@clerk/nextjs";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowLeftRightIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  CopyIcon,
  EyeIcon,
  FilterIcon,
  MoreHorizontalIcon,
  PencilLineIcon,
  PlusIcon,
  ReceiptTextIcon,
  RefreshCcwIcon,
  RotateCcwIcon,
  SearchIcon,
  TagsIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ApiClientError,
  accountQueryKey,
  accountsQueryKey,
  getAccount,
  listAccounts,
  updateAccount,
} from "@/features/accounts/accounts-api";
import {
  getAccountTypeLabel,
  type Account,
  type AccountType,
} from "@/features/accounts/account-types";
import { AccountFormDialog } from "@/features/accounts/account-form-dialog";
import type { AccountFormPayload } from "@/features/accounts/account-form-schema";
import { AdjustBalanceDialog } from "@/features/accounts/adjust-balance-dialog";
import {
  categoriesQueryKey,
  listTransactionCategories,
} from "@/features/categories/categories-api";
import { assetsQueryKey, listAssets } from "@/features/assets/assets-api";
import { dashboardQueryKey } from "@/features/dashboard/dashboard-api";
import {
  holdingsQueryKey,
  listHoldings,
} from "@/features/investments/investments-api";
import { portfoliosQueryKey } from "@/features/portfolios/portfolios-api";
import {
  getSettings,
  settingsQueryKey,
} from "@/features/settings/settings-api";
import { formatAmount, formatSignedAmount } from "@/lib/formatting";
import { cn } from "@/lib/utils";

import {
  clearTransactionFilters,
  datePresetOptions,
  getDatePresetLabel,
  readTransactionFilters,
  toTransactionListParams,
  writeTransactionFilter,
  type TransactionFilters,
} from "./transaction-filters";
import { TransactionFormDialog } from "./transaction-form-dialog";
import { InvestmentAccountSummaryPanel } from "@/features/investments/investment-account-summary";
import { AddHoldingDialog } from "@/features/investments/add-holding-dialog";
import { FundInvestmentAccountDialog } from "@/features/investments/fund-investment-account-dialog";
import type { TransactionFormPayload } from "./transaction-form-schema";
import {
  bulkUpdateTransactions,
  createTransaction,
  deleteTransaction,
  listTransactions,
  listAccountTransactions,
  reverseTransaction,
  transactionsQueryKey,
  updateTransaction,
} from "./transactions-api";
import {
  getTransactionSign,
  getTransactionTypeLabel,
  isReversibleType,
  isTransferType,
  transactionStatusOptions,
  transactionTypeOptions,
  type BulkTransactionPayload,
  type Transaction,
  type TransactionCategories,
  type TransactionStatus,
  type TransactionType,
} from "./transaction-types";

type DialogState =
  | { readonly mode: "create"; readonly transaction?: Transaction }
  | { readonly mode: "edit"; readonly transaction: Transaction }
  | null;
type Confirmation =
  | { readonly kind: "delete"; readonly transaction: Transaction }
  | { readonly kind: "reverse"; readonly transaction: Transaction }
  | { readonly kind: "bulk-delete"; readonly count: number }
  | null;

export function TransactionsPage({
  accountId,
}: {
  readonly accountId?: string;
}) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedScope = searchParams.get("scope");
  const scope: "MONEY" | "SECURITIES" | "CRYPTO" | undefined = accountId
    ? undefined
    : requestedScope === "SECURITIES" || requestedScope === "CRYPTO"
      ? requestedScope
      : "MONEY";
  const filters = useMemo(() => {
    const parsed = readTransactionFilters(searchParams);
    return accountId ? { ...parsed, accountIds: [], currencies: [] } : parsed;
  }, [accountId, searchParams]);
  const [searchText, setSearchText] = useState(filters.search);
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);
  const requestedAction = parseInvestmentAction(searchParams.get("action"));
  const [dialog, setDialog] = useState<DialogState>(
    requestedAction ? { mode: "create" } : null,
  );
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [details, setDetails] = useState<Transaction | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [accountAction, setAccountAction] = useState<
    "edit" | "adjust" | "fund" | null
  >(null);

  function updateUrl(
    key: string,
    value: string | readonly string[] | boolean | undefined,
  ) {
    const next = writeTransactionFilter(
      new URLSearchParams(searchParams.toString()),
      key,
      value,
    );
    router.replace(next.size ? `${pathname}?${next}` : pathname, {
      scroll: false,
    });
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchText.trim());
      updateUrl("search", searchText.trim());
    }, 400);
    return () => window.clearTimeout(timer);
    // Search is the only input that intentionally debounces URL updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  const listParams = useMemo(() => {
    const params = toTransactionListParams(filters, debouncedSearch);
    return accountId
      ? { ...params, accountIds: [], currencies: [] }
      : { ...params, scope };
  }, [accountId, filters, debouncedSearch, scope]);
  const listKey = useMemo(() => JSON.stringify(listParams), [listParams]);
  const accountsQuery = useQuery({
    queryKey: accountsQueryKey,
    queryFn: () => listAccounts(getToken, scope),
  });
  const accountQuery = useQuery({
    queryKey: accountQueryKey(accountId ?? "inactive"),
    queryFn: () => {
      if (!accountId) throw new Error("Account id is required.");
      return getAccount(getToken, accountId);
    },
    enabled: Boolean(accountId),
  });
  const categoriesQuery = useQuery({
    queryKey: categoriesQueryKey,
    queryFn: () => listTransactionCategories(getToken),
  });
  const assetsQuery = useQuery({
    queryKey: assetsQueryKey,
    queryFn: () =>
      listAssets(
        getToken,
        scope === "CRYPTO" ? "CRYPTO" : scope === "SECURITIES" ? "SECURITIES" : undefined,
      ),
  });
  const holdingsQuery = useQuery({
    queryKey: [...holdingsQueryKey, "NATIVE"],
    queryFn: () =>
      listHoldings(getToken, "NATIVE", {
        domain: scope === "CRYPTO" ? "CRYPTO" : "SECURITIES",
      }),
  });
  const settingsQuery = useQuery({
    queryKey: settingsQueryKey,
    queryFn: () => getSettings(getToken),
  });
  const transactionsQuery = useQuery({
    queryKey: [
      ...transactionsQueryKey,
      ...(accountId ? ["account", accountId] : ["all"]),
      listKey,
    ],
    queryFn: () =>
      accountId
        ? listAccountTransactions(getToken, accountId, listParams)
        : listTransactions(getToken, listParams),
    enabled: !accountId || accountQuery.isSuccess,
    placeholderData: keepPreviousData,
  });

  const saveMutation = useMutation({
    mutationFn: async ({
      mode,
      id,
      payload,
    }: {
      mode: "create" | "edit";
      id?: string;
      payload: TransactionFormPayload;
    }) => {
      if (mode === "create")
        return createTransaction(getToken, {
          ...payload,
          idempotencyKey: crypto.randomUUID(),
        });
      if (!id)
        throw new Error("Transaction id is required to update a transaction.");
      return updateTransaction(getToken, id, payload);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTransaction(getToken, id),
  });
  const reverseMutation = useMutation({
    mutationFn: (id: string) => reverseTransaction(getToken, id),
  });
  const bulkMutation = useMutation({
    mutationFn: (payload: BulkTransactionPayload) =>
      bulkUpdateTransactions(getToken, payload),
  });
  const updateAccountMutation = useMutation({
    mutationFn: (payload: AccountFormPayload) => {
      if (!accountId) throw new Error("Account id is required.");
      return updateAccount(getToken, accountId, payload);
    },
  });

  const accounts = accountsQuery.data ?? [];
  const account = accountQuery.data;
  useEffect(() => {
    if (!accountId || !account) return;
    if (account.type === "BROKER") {
      router.replace(`/stocks?accountId=${account.id}`);
    } else if (account.type === "CRYPTO_WALLET") {
      router.replace(`/crypto?accountId=${account.id}`);
    }
  }, [account, accountId, router]);
  const transactions = transactionsQuery.data?.data ?? [];
  const meta = transactionsQuery.data?.meta;
  const visibleIds = transactions.map((transaction) => transaction.id);
  const selectedTransactions = transactions.filter((transaction) =>
    selectedIds.has(transaction.id),
  );
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const hasActiveFilters =
    getFilterChips(filters).length > 0 || Boolean(filters.search);
  const accountNotFound =
    accountQuery.error instanceof ApiClientError &&
    accountQuery.error.status === 404;
  const hasError =
    accountsQuery.isError ||
    assetsQuery.isError ||
    holdingsQuery.isError ||
    categoriesQuery.isError ||
    (accountQuery.isError && !accountNotFound) ||
    transactionsQuery.isError;

  function toggleArrayFilter(
    key: string,
    values: readonly string[],
    value: string,
  ) {
    updateUrl(
      key,
      values.includes(value)
        ? values.filter((item) => item !== value)
        : [...values, value],
    );
  }
  function clearFilters() {
    setSearchText("");
    setDebouncedSearch("");
    router.replace(`${pathname}?${clearTransactionFilters()}`, {
      scroll: false,
    });
  }
  async function retryFailedQueries() {
    await Promise.all([
      accountsQuery.refetch(),
      categoriesQuery.refetch(),
      assetsQuery.refetch(),
      holdingsQuery.refetch(),
      ...(accountId ? [accountQuery.refetch()] : []),
      ...(!accountId || account ? [transactionsQuery.refetch()] : []),
    ]);
  }
  function toggleSort(sortBy: TransactionFilters["sortBy"]) {
    const direction =
      filters.sortBy === sortBy && filters.sortDirection === "asc"
        ? "desc"
        : "asc";
    const next = writeTransactionFilter(
      new URLSearchParams(searchParams.toString()),
      "sortBy",
      sortBy,
    );
    next.set("sortDirection", direction);
    router.replace(`${pathname}?${next}`, { scroll: false });
  }
  function toggleVisible(checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      visibleIds.forEach((id) => {
        if (checked) {
          next.add(id);
        } else {
          next.delete(id);
        }
      });
      return next;
    });
  }
  async function invalidateAll() {
    setSelectedIds(new Set());
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: transactionsQueryKey }),
      queryClient.invalidateQueries({ queryKey: accountsQueryKey }),
      queryClient.invalidateQueries({ queryKey: assetsQueryKey }),
      queryClient.invalidateQueries({ queryKey: holdingsQueryKey }),
      queryClient.invalidateQueries({ queryKey: dashboardQueryKey }),
      queryClient.invalidateQueries({ queryKey: categoriesQueryKey }),
      queryClient.invalidateQueries({ queryKey: portfoliosQueryKey }),
      ...(accountId
        ? [
            queryClient.invalidateQueries({
              queryKey: accountQueryKey(accountId),
            }),
          ]
        : []),
    ]);
  }

  async function saveAccount(payload: AccountFormPayload) {
    await updateAccountMutation.mutateAsync(payload);
    toast.success("Account updated.");
    setAccountAction(null);
    await invalidateAll();
  }
  async function save(payload: TransactionFormPayload) {
    if (!dialog) return;
    await saveMutation.mutateAsync({
      mode: dialog.mode,
      id: dialog.mode === "edit" ? dialog.transaction.id : undefined,
      payload,
    });
    toast.success(
      dialog.mode === "create" ? "Transaction added." : "Transaction updated.",
    );
    setDialog(null);
    await invalidateAll();
  }
  async function confirmAction() {
    if (!confirmation) return;
    if (confirmation.kind === "delete") {
      await deleteMutation.mutateAsync(confirmation.transaction.id);
      toast.success("Transaction deleted.");
    } else if (confirmation.kind === "reverse") {
      await reverseMutation.mutateAsync(confirmation.transaction.id);
      toast.success("Transaction reversed.");
    } else {
      await bulkMutation.mutateAsync({
        transactionIds: [...selectedIds],
        delete: true,
      });
      toast.success(`${confirmation.count} transactions deleted.`);
    }
    setConfirmation(null);
    setDetails(null);
    await invalidateAll();
  }
  async function bulkAction(
    payload: Omit<BulkTransactionPayload, "transactionIds">,
    message: string,
  ) {
    await bulkMutation.mutateAsync({
      transactionIds: [...selectedIds],
      ...payload,
    });
    toast.success(message);
    await invalidateAll();
  }

  const filterProps = {
    filters,
    accounts,
    categories: meta?.filterOptions.categories ?? [],
    labels: meta?.filterOptions.labels ?? [],
    currencies: meta?.filterOptions.currencies ?? [],
    hideAccount: Boolean(accountId),
    hideCurrency: Boolean(accountId),
    updateUrl,
    toggleArrayFilter,
  };
  const bulkCategories = getCommonCategories(
    selectedTransactions.map((transaction) => transaction.type),
    categoriesQuery.data,
  );

  return (
    <AppShell
      currentSection={accountId ? "accounts" : scope === "CRYPTO" ? "crypto" : scope === "SECURITIES" ? "stocks" : "transactions"}
      title={accountId ? (account?.name ?? "Account") : scope === "CRYPTO" ? "Crypto activity" : scope === "SECURITIES" ? "Stock activity" : "Transactions"}
      description={
        accountId
          ? "Review balances and activity for this account."
          : scope === "MONEY" ? "View and manage everyday money activity." : `View and manage ${scope === "CRYPTO" ? "crypto" : "securities"} activity.`
      }
      primaryAction={
        <div className="flex items-center gap-2">
          {account ? (
            <>
              {account.type === "BROKER" || account.type === "CRYPTO_WALLET" ? (
                <Button size="sm" onClick={() => setAccountAction("fund")}>
                  <PlusIcon data-icon="inline-start" />
                  <span className="hidden sm:inline">Add funds</span>
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAccountAction("edit")}
              >
                <PencilLineIcon data-icon="inline-start" />
                <span className="hidden sm:inline">Edit</span>
              </Button>
              {account.type !== "CRYPTO_WALLET" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAccountAction("adjust")}
                >
                  <ArrowUpDownIcon data-icon="inline-start" />
                  <span className="hidden sm:inline">Adjust balance</span>
                </Button>
              ) : null}
            </>
          ) : null}
          <Button
            size="sm"
            disabled={
              !accounts.length ||
              categoriesQuery.isPending ||
              categoriesQuery.isError ||
              Boolean(accountId && !account)
            }
            onClick={() => setDialog({ mode: "create" })}
          >
            <PlusIcon data-icon="inline-start" />
            Add transaction
          </Button>
        </div>
      }
    >
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
        {accountId ? (
          <div>
            <Button asChild size="sm" variant="ghost">
              <Link href="/accounts">
                <ArrowLeftIcon data-icon="inline-start" />
                Back to accounts
              </Link>
            </Button>
          </div>
        ) : null}
        {accountId && accountQuery.isLoading ? <AccountHeaderSkeleton /> : null}
        {accountId && accountNotFound ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CircleAlertIcon />
              </EmptyMedia>
              <EmptyTitle>Account not found</EmptyTitle>
              <EmptyDescription>
                This account does not exist or is unavailable to your user.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}

        {account ? <AccountOverview account={account} /> : null}
        {account &&
        (account.type === "BROKER" || account.type === "CRYPTO_WALLET") ? (
          <InvestmentAccountSummaryPanel
            accountId={account.id}
            getToken={getToken}
          />
        ) : null}

        {hasError ? (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>
              {accountId
                ? "Unable to load account activity"
                : "Unable to load transactions"}
            </AlertTitle>
            <AlertDescription className="flex items-center justify-between gap-3">
              <span>
                {transactionsQuery.error?.message ??
                  accountsQuery.error?.message ??
                  accountQuery.error?.message ??
                  categoriesQuery.error?.message ??
                  assetsQuery.error?.message ??
                  holdingsQuery.error?.message}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void retryFailedQueries()}
              >
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        <section
          className={cn(
            "grid gap-3 sm:grid-cols-2 xl:grid-cols-4",
            accountId && !account && "hidden",
          )}
          aria-label="Filtered transaction summary"
        >
          <SummaryCard
            label={accountId ? "Inflows" : "Money in"}
            value={
              meta ? formatAmount(meta.summary.moneyIn, meta.baseCurrency) : "—"
            }
            detail={
              accountId
                ? `For ${getDatePresetLabel(filters.datePreset)}`
                : `Base currency: ${meta?.baseCurrency ?? "—"}`
            }
          />
          <SummaryCard
            label={accountId ? "Outflows" : "Money out"}
            value={
              meta
                ? formatAmount(meta.summary.moneyOut, meta.baseCurrency)
                : "—"
            }
            detail={
              accountId
                ? "All cleared account effects"
                : "Transfers and investments excluded"
            }
          />
          <SummaryCard
            label={accountId ? "Net movement" : "Net cash flow"}
            value={
              meta
                ? formatSignedAmount(
                    meta.summary.netCashFlow,
                    meta.baseCurrency,
                  )
                : "—"
            }
            detail="For the current filters"
          />
          <SummaryCard
            label="Transactions"
            value={meta ? String(meta.summary.transactionCount) : "—"}
            detail="Matching all filters"
          />
        </section>

        <Card className={cn(accountId && !account && "hidden")}>
          <CardHeader className="gap-4">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Transaction history</CardTitle>
              {transactionsQuery.isFetching && transactionsQuery.data ? (
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Spinner className="size-3" />
                  Updating results…
                </span>
              ) : null}
            </div>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Search transactions"
                  placeholder="Search transactions"
                  className="px-9"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                />
                {searchText ? (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="absolute right-1 top-1/2 -translate-y-1/2"
                    aria-label="Clear search"
                    onClick={() => setSearchText("")}
                  >
                    <XIcon />
                  </Button>
                ) : null}
              </div>
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" className="md:hidden">
                    <FilterIcon data-icon="inline-start" />
                    Filters
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-full overflow-y-auto sm:max-w-md">
                  <SheetHeader>
                    <SheetTitle>Transaction filters</SheetTitle>
                    <SheetDescription>
                      Filters are saved in the page URL.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="px-4">
                    <FilterControls {...filterProps} mobile />
                  </div>
                  <SheetFooter>
                    <Button variant="outline" onClick={clearFilters}>
                      Clear all
                    </Button>
                  </SheetFooter>
                </SheetContent>
              </Sheet>
            </div>
            <div className="hidden flex-wrap gap-2 md:flex">
              <FilterControls {...filterProps} />
            </div>
            {hasActiveFilters ? (
              <div
                className="flex flex-wrap items-center gap-2"
                aria-label="Active filters"
              >
                {getFilterChips(filters).map((chip) => (
                  <Badge
                    key={`${chip.key}-${chip.value}`}
                    variant="secondary"
                    className="gap-1"
                  >
                    {chip.label}
                    <button
                      type="button"
                      aria-label={`Remove ${chip.label} filter`}
                      onClick={() =>
                        removeChip(chip.key, chip.value, filters, updateUrl)
                      }
                    >
                      <XIcon className="size-3" />
                    </button>
                  </Badge>
                ))}
                {filters.search ? (
                  <Badge variant="secondary" className="gap-1">
                    Search: {filters.search}
                    <button
                      type="button"
                      aria-label="Remove search filter"
                      onClick={() => setSearchText("")}
                    >
                      <XIcon className="size-3" />
                    </button>
                  </Badge>
                ) : null}
                <Button size="sm" variant="ghost" onClick={clearFilters}>
                  Clear all
                </Button>
              </div>
            ) : null}
          </CardHeader>

          <CardContent className="flex flex-col gap-4">
            {selectedIds.size ? (
              <BulkBar
                count={selectedIds.size}
                canCategorize={bulkCategories.length > 0}
                categories={bulkCategories}
                labels={meta?.filterOptions.labels ?? []}
                pending={bulkMutation.isPending}
                onClear={() => setSelectedIds(new Set())}
                onAction={bulkAction}
                onDelete={() =>
                  setConfirmation({
                    kind: "bulk-delete",
                    count: selectedIds.size,
                  })
                }
              />
            ) : null}
            {!accounts.length && !accountsQuery.isLoading ? (
              <Alert>
                <CircleAlertIcon />
                <AlertTitle>No accounts available</AlertTitle>
                <AlertDescription>
                  Create at least one account before recording transactions.
                </AlertDescription>
              </Alert>
            ) : null}
            {transactionsQuery.isLoading && !transactionsQuery.data ? (
              <TableSkeleton />
            ) : !transactions.length ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ReceiptTextIcon />
                  </EmptyMedia>
                  <EmptyTitle>
                    {hasActiveFilters
                      ? "No transactions match these filters."
                      : "No transactions yet."}
                  </EmptyTitle>
                  <EmptyDescription>
                    {hasActiveFilters
                      ? "Try removing a filter or expanding the date range."
                      : "Add your first transaction to start tracking your finances."}
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  {hasActiveFilters ? (
                    <Button variant="outline" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  ) : (
                    <Button
                      disabled={!accounts.length || !categoriesQuery.isSuccess}
                      onClick={() => setDialog({ mode: "create" })}
                    >
                      <PlusIcon />
                      Add transaction
                    </Button>
                  )}
                </EmptyContent>
              </Empty>
            ) : (
              <>
                <div className="hidden max-h-[65vh] overflow-auto md:block">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-card">
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            aria-label="Select all visible transactions"
                            checked={
                              allVisibleSelected
                                ? true
                                : selectedIds.size &&
                                    visibleIds.some((id) => selectedIds.has(id))
                                  ? "indeterminate"
                                  : false
                            }
                            onCheckedChange={(value) =>
                              toggleVisible(value === true)
                            }
                          />
                        </TableHead>
                        <SortHead
                          label="Date"
                          value="date"
                          filters={filters}
                          onSort={toggleSort}
                        />
                        <SortHead
                          label="Description"
                          value="description"
                          filters={filters}
                          onSort={toggleSort}
                        />
                        <SortHead
                          label="Account"
                          value="account"
                          filters={filters}
                          onSort={toggleSort}
                          className="hidden lg:table-cell"
                        />
                        <SortHead
                          label="Category"
                          value="category"
                          filters={filters}
                          onSort={toggleSort}
                          className="hidden xl:table-cell"
                        />
                        <TableHead className="hidden xl:table-cell">
                          Type
                        </TableHead>
                        <TableHead className="hidden 2xl:table-cell">
                          Labels
                        </TableHead>
                        <SortHead
                          label="Created"
                          value="createdAt"
                          filters={filters}
                          onSort={toggleSort}
                          className="hidden 2xl:table-cell"
                        />
                        <SortHead
                          label="Amount"
                          value="amount"
                          filters={filters}
                          onSort={toggleSort}
                          className="text-right"
                        />
                        <TableHead>Status</TableHead>
                        <TableHead className="w-12">
                          <span className="sr-only">Actions</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((transaction) => (
                        <TransactionRow
                          key={transaction.id}
                          transaction={transaction}
                          selected={selectedIds.has(transaction.id)}
                          onSelect={(checked) =>
                            setSelectedIds((current) => {
                              const next = new Set(current);
                              if (checked) {
                                next.add(transaction.id);
                              } else {
                                next.delete(transaction.id);
                              }
                              return next;
                            })
                          }
                          onView={setDetails}
                          onEdit={(item) =>
                            setDialog({ mode: "edit", transaction: item })
                          }
                          onDuplicate={(item) =>
                            setDialog({ mode: "create", transaction: item })
                          }
                          onDelete={(item) =>
                            setConfirmation({
                              kind: "delete",
                              transaction: item,
                            })
                          }
                          onReverse={(item) =>
                            setConfirmation({
                              kind: "reverse",
                              transaction: item,
                            })
                          }
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="grid gap-3 md:hidden">
                  {transactions.map((transaction) => (
                    <MobileCard
                      key={transaction.id}
                      transaction={transaction}
                      onView={setDetails}
                      onEdit={(item) =>
                        setDialog({ mode: "edit", transaction: item })
                      }
                      onDuplicate={(item) =>
                        setDialog({ mode: "create", transaction: item })
                      }
                      onDelete={(item) =>
                        setConfirmation({ kind: "delete", transaction: item })
                      }
                      onReverse={(item) =>
                        setConfirmation({ kind: "reverse", transaction: item })
                      }
                    />
                  ))}
                </div>
                <Pagination
                  meta={meta}
                  onPage={(page) => updateUrl("page", String(page))}
                  onPageSize={(size) => updateUrl("pageSize", size)}
                />
              </>
            )}
          </CardContent>
        </Card>
      </main>

      <TransactionFormDialog
        open={dialog !== null}
        mode={dialog?.mode ?? "create"}
        scope={
          account?.type === "CRYPTO_WALLET"
            ? "CRYPTO"
            : account?.type === "BROKER"
              ? "SECURITIES"
              : scope
        }
        transaction={dialog?.transaction ?? null}
        accounts={accounts}
        assets={assetsQuery.data ?? []}
        holdings={holdingsQuery.data ?? []}
        categoriesByType={categoriesQuery.data}
        initialAccountId={
          accountId ?? searchParams.get("accountId") ?? undefined
        }
        initialAssetId={searchParams.get("assetId") ?? undefined}
        initialType={requestedAction ?? undefined}
        exchangeRate={settingsQuery.data?.exchangeRate}
        defaultCurrency={
          (settingsQuery.data?.baseCurrency === "PKR" ? "PKR" : "USD") as
            "PKR" | "USD"
        }
        isPending={saveMutation.isPending}
        errorMessage={saveMutation.isError ? saveMutation.error.message : null}
        onOpenChange={(open) => {
          if (!open) {
            setDialog(null);
            saveMutation.reset();
          }
        }}
        onSubmit={save}
      />
      {account && accountAction === "edit" ? (
        <AccountFormDialog
          open
          mode="edit"
          account={account}
          isPending={updateAccountMutation.isPending}
          errorMessage={
            updateAccountMutation.isError
              ? updateAccountMutation.error.message
              : null
          }
          onOpenChange={(open) => {
            if (!open) {
              setAccountAction(null);
              updateAccountMutation.reset();
            }
          }}
          onSubmit={saveAccount}
        />
      ) : null}
      {account?.type === "BROKER" && accountAction === "fund" ? (
        <FundInvestmentAccountDialog
          account={account}
          accounts={accounts}
          getToken={getToken}
          open
          onOpenChange={(open) => {
            if (!open) setAccountAction(null);
          }}
        />
      ) : null}
      {account?.type === "CRYPTO_WALLET" ? (
      <AddHoldingDialog
        domain="CRYPTO"
        cashEquivalentOnly
          getToken={getToken}
          initialAccountId={account.id}
          lockAccount
          open={accountAction === "fund"}
          onOpenChange={(open) => {
            if (!open) setAccountAction(null);
          }}
        />
      ) : null}
      {account &&
      account.type !== "CRYPTO_WALLET" &&
      accountAction === "adjust" ? (
        <AdjustBalanceDialog
          account={account}
          onClose={() => setAccountAction(null)}
        />
      ) : null}
      <DetailSheet
        transaction={details}
        baseCurrency={
          meta?.baseCurrency ?? settingsQuery.data?.baseCurrency ?? "USD"
        }
        exchangeRate={settingsQuery.data?.exchangeRate ?? undefined}
        onClose={() => setDetails(null)}
        onEdit={(item) => {
          setDetails(null);
          setDialog({ mode: "edit", transaction: item });
        }}
        onDelete={(item) =>
          setConfirmation({ kind: "delete", transaction: item })
        }
      />
      <AlertDialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              {confirmation?.kind === "reverse" ? (
                <RefreshCcwIcon />
              ) : (
                <Trash2Icon />
              )}
            </AlertDialogMedia>
            <AlertDialogTitle>
              {confirmation?.kind === "reverse"
                ? "Reverse transaction"
                : confirmation?.kind === "bulk-delete"
                  ? `Delete ${confirmation.count} transactions?`
                  : "Delete transaction"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmationText(confirmation)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteMutation.isError ||
          reverseMutation.isError ||
          bulkMutation.isError ? (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertTitle>Action failed</AlertTitle>
              <AlertDescription>
                {deleteMutation.error?.message ??
                  reverseMutation.error?.message ??
                  bulkMutation.error?.message}
              </AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={
                confirmation?.kind === "reverse" ? "default" : "destructive"
              }
              onClick={(event) => {
                event.preventDefault();
                void confirmAction();
              }}
            >
              {deleteMutation.isPending ||
              reverseMutation.isPending ||
              bulkMutation.isPending ? (
                <Spinner />
              ) : confirmation?.kind === "reverse" ? (
                "Reverse"
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function parseInvestmentAction(value: string | null): TransactionType | null {
  return value === "INVESTMENT_BUY" ||
    value === "INVESTMENT_SELL" ||
    value === "DIVIDEND" ||
    value === "INVESTMENT_REINVESTMENT" ||
    value === "INVESTMENT_SPLIT" ||
    value === "INVESTMENT_BONUS" ||
    value === "INVESTMENT_DEPOSIT" ||
    value === "INVESTMENT_WITHDRAWAL" ||
    value === "INVESTMENT_TRANSFER"
    ? value
    : null;
}

type FilterProps = {
  filters: TransactionFilters;
  accounts: readonly {
    id: string;
    name: string;
    type: AccountType;
    archivedAt: string | null;
  }[];
  categories: readonly string[];
  labels: readonly string[];
  currencies: readonly string[];
  hideAccount?: boolean;
  hideCurrency?: boolean;
  updateUrl: (
    key: string,
    value: string | readonly string[] | boolean | undefined,
  ) => void;
  toggleArrayFilter: (
    key: string,
    values: readonly string[],
    value: string,
  ) => void;
  mobile?: boolean;
};

function FilterControls({
  filters,
  accounts,
  categories,
  labels,
  currencies,
  hideAccount,
  hideCurrency,
  updateUrl,
  toggleArrayFilter,
  mobile,
}: FilterProps) {
  return (
    <div className={cn("contents", mobile && "grid gap-3")}>
      <FilterSelect
        label="Date"
        value={filters.datePreset}
        options={datePresetOptions}
        onChange={(value) => updateUrl("date", value)}
        mobile={mobile}
      />
      {filters.datePreset === "custom" ? (
        <div className="flex gap-2">
          <Input
            type="date"
            aria-label="Start date"
            value={filters.customFrom}
            onChange={(event) => updateUrl("from", event.target.value)}
          />
          <Input
            type="date"
            aria-label="End date"
            value={filters.customTo}
            onChange={(event) => updateUrl("to", event.target.value)}
          />
        </div>
      ) : null}
      {!hideAccount ? (
        <MultiFilter
          label="Accounts"
          selected={filters.accountIds}
          options={accounts.map((account) => ({
            value: account.id,
            label: `${account.name} · ${getAccountTypeLabel(account.type)}${account.archivedAt ? " (Archived)" : ""}`,
          }))}
          onToggle={(value) =>
            toggleArrayFilter("accounts", filters.accountIds, value)
          }
          mobile={mobile}
        />
      ) : null}
      <MultiFilter
        label="Types"
        selected={filters.types}
        options={transactionTypeOptions}
        onToggle={(value) => toggleArrayFilter("types", filters.types, value)}
        mobile={mobile}
      />
      <MultiFilter
        label="Categories"
        selected={filters.categories}
        options={categories.map((value) => ({ value, label: value }))}
        onToggle={(value) =>
          toggleArrayFilter("categories", filters.categories, value)
        }
        mobile={mobile}
      />
      <MultiFilter
        label="Labels"
        selected={filters.labels}
        options={labels.map((value) => ({ value, label: value }))}
        onToggle={(value) => toggleArrayFilter("labels", filters.labels, value)}
        mobile={mobile}
      />
      <MultiFilter
        label="Status"
        selected={filters.statuses}
        options={transactionStatusOptions}
        onToggle={(value) =>
          toggleArrayFilter("statuses", filters.statuses, value)
        }
        mobile={mobile}
      />
      <FilterSelect
        label="Direction"
        value={filters.direction || "ALL"}
        options={[
          { value: "ALL", label: "Any direction" },
          { value: "IN", label: "Money in" },
          { value: "OUT", label: "Money out" },
        ]}
        onChange={(value) =>
          updateUrl("direction", value === "ALL" ? undefined : value)
        }
        mobile={mobile}
      />
      {!hideCurrency && currencies.length > 1 ? (
        <MultiFilter
          label="Currency"
          selected={filters.currencies}
          options={currencies.map((value) => ({ value, label: value }))}
          onToggle={(value) =>
            toggleArrayFilter("currencies", filters.currencies, value)
          }
          mobile={mobile}
        />
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className={cn(mobile && "w-full justify-between")}
          >
            <FilterIcon data-icon="inline-start" />
            More filters
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-72 p-3" align="start">
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="minimum-amount" className="text-xs">
                  Min amount
                </Label>
                <Input
                  id="minimum-amount"
                  value={filters.minAmount}
                  inputMode="decimal"
                  onChange={(event) =>
                    updateUrl("minAmount", event.target.value)
                  }
                />
              </div>
              <div>
                <Label htmlFor="maximum-amount" className="text-xs">
                  Max amount
                </Label>
                <Input
                  id="maximum-amount"
                  value={filters.maxAmount}
                  inputMode="decimal"
                  onChange={(event) =>
                    updateUrl("maxAmount", event.target.value)
                  }
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={filters.hasNote === true}
                onCheckedChange={(checked) =>
                  updateUrl("hasNote", checked === true ? "true" : undefined)
                }
              />
              Has note
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={filters.uncategorizedOnly}
                onCheckedChange={(checked) =>
                  updateUrl("uncategorized", checked === true)
                }
              />
              Uncategorized only
            </label>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  mobile,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  mobile?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={label}
        className={cn("w-auto min-w-32", mobile && "w-full")}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function MultiFilter({
  label,
  selected,
  options,
  onToggle,
  mobile,
}: {
  label: string;
  selected: readonly string[];
  options: readonly { value: string; label: string }[];
  onToggle: (value: string) => void;
  mobile?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn(mobile && "w-full justify-between")}
        >
          {label}
          {selected.length ? (
            <Badge variant="secondary">{selected.length}</Badge>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.length ? (
          options.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={selected.includes(option.value)}
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={() => onToggle(option.value)}
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          ))
        ) : (
          <DropdownMenuItem disabled>No options yet</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BulkBar({
  count,
  canCategorize,
  categories,
  labels,
  pending,
  onClear,
  onAction,
  onDelete,
}: {
  count: number;
  canCategorize: boolean;
  categories: readonly string[];
  labels: readonly string[];
  pending: boolean;
  onClear: () => void;
  onAction: (
    payload: Omit<BulkTransactionPayload, "transactionIds">,
    message: string,
  ) => Promise<void>;
  onDelete: () => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 p-3"
      aria-label="Bulk actions"
    >
      <strong className="mr-auto text-sm">{count} selected</strong>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            disabled={!canCategorize || pending}
          >
            Change category
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {categories.length ? (
            categories.map((category) => (
              <DropdownMenuItem
                key={category}
                onSelect={() =>
                  void onAction(
                    { category },
                    `Category changed for ${count} transactions.`,
                  )
                }
              >
                {category}
              </DropdownMenuItem>
            ))
          ) : (
            <DropdownMenuItem disabled>No categories yet</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" disabled={pending}>
            <TagsIcon />
            Labels
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Add label</DropdownMenuLabel>
          {labels.map((label) => (
            <DropdownMenuItem
              key={`add-${label}`}
              onSelect={() =>
                void onAction(
                  { addLabels: [label] },
                  `Label added to ${count} transactions.`,
                )
              }
            >
              <PlusIcon />
              {label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Remove label</DropdownMenuLabel>
          {labels.map((label) => (
            <DropdownMenuItem
              key={`remove-${label}`}
              onSelect={() =>
                void onAction(
                  { removeLabels: [label] },
                  `Label removed from ${count} transactions.`,
                )
              }
            >
              <XIcon />
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          void onAction(
            { status: "CLEARED" },
            `${count} transactions marked cleared.`,
          )
        }
      >
        <CheckIcon />
        Mark cleared
      </Button>
      <Button
        size="sm"
        variant="destructive"
        disabled={pending}
        onClick={onDelete}
      >
        <Trash2Icon />
        Delete
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Clear selection"
        onClick={onClear}
      >
        <XIcon />
      </Button>
    </div>
  );
}

type RowActions = {
  transaction: Transaction;
  onView: (item: Transaction) => void;
  onEdit: (item: Transaction) => void;
  onDuplicate: (item: Transaction) => void;
  onDelete: (item: Transaction) => void;
  onReverse?: (item: Transaction) => void;
};
function TransactionRow({
  transaction,
  selected,
  onSelect,
  ...actions
}: RowActions & { selected: boolean; onSelect: (checked: boolean) => void }) {
  const muted =
    transaction.status === "FAILED" ||
    transaction.status === "VOIDED" ||
    Boolean(transaction.reversalOfId);
  return (
    <TableRow
      tabIndex={0}
      data-muted={muted || undefined}
      className="cursor-pointer data-[muted=true]:opacity-55"
      onClick={() => actions.onView(transaction)}
      onKeyDown={(event) => {
        if (event.key === "Enter") actions.onView(transaction);
      }}
    >
      <TableCell onClick={(event) => event.stopPropagation()}>
        <Checkbox
          aria-label={`Select ${displayText(transaction)}`}
          checked={selected}
          onCheckedChange={(value) => onSelect(value === true)}
        />
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {formatDate(transaction.occurredAt)}
      </TableCell>
      <TableCell className="max-w-64">
        <div className="flex flex-col">
          <span className="truncate font-medium">
            {displayText(transaction)}
          </span>
          {transaction.notes || transaction.reference ? (
            <span className="truncate text-xs text-muted-foreground">
              {transaction.notes ?? transaction.reference}
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="hidden max-w-48 lg:table-cell">
        <span className="block truncate">{transaction.accountName}</span>
        {transaction.destinationAccountName ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <ArrowLeftRightIcon className="size-3" />
            {transaction.destinationAccountName}
          </span>
        ) : null}
      </TableCell>
      <TableCell className="hidden xl:table-cell">
        {transaction.category || (
          <span className="text-muted-foreground">Uncategorized</span>
        )}
      </TableCell>
      <TableCell className="hidden xl:table-cell">
        <Badge variant="secondary">
          {getTransactionTypeLabel(transaction.type)}
        </Badge>
      </TableCell>
      <TableCell className="hidden 2xl:table-cell">
        <Labels labels={transaction.labels} />
      </TableCell>
      <TableCell className="hidden whitespace-nowrap 2xl:table-cell">
        {formatDate(transaction.createdAt)}
      </TableCell>
      <TableCell
        className={cn(
          "whitespace-nowrap text-right font-mono font-medium",
          amountColor(transaction),
        )}
      >
        {transactionAmount(transaction)}
      </TableCell>
      <TableCell>
        <Status status={transaction.status} />
      </TableCell>
      <TableCell onClick={(event) => event.stopPropagation()}>
        <Actions transaction={transaction} {...actions} />
      </TableCell>
    </TableRow>
  );
}
function MobileCard({ transaction, ...actions }: RowActions) {
  return (
    <div className="relative grid w-full gap-3 rounded-lg border p-4 text-left">
      <button
        type="button"
        className="absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={`View ${displayText(transaction)}`}
        onClick={() => actions.onView(transaction)}
      />
      <div className="pointer-events-none relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{displayText(transaction)}</p>
          <p className="truncate text-xs text-muted-foreground">
            {formatDate(transaction.occurredAt)} · {transaction.accountName}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 font-mono font-medium",
            amountColor(transaction),
          )}
        >
          {transactionAmount(transaction)}
        </span>
      </div>
      <div className="pointer-events-none relative flex items-center gap-2">
        <Badge variant="secondary">
          {getTransactionTypeLabel(transaction.type)}
        </Badge>
        <Status status={transaction.status} />
        <span className="pointer-events-auto relative z-10 ml-auto">
          <Actions transaction={transaction} {...actions} />
        </span>
      </div>
    </div>
  );
}
function Actions({
  transaction,
  onView,
  onEdit,
  onDuplicate,
  onDelete,
  onReverse,
}: RowActions) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Actions for ${displayText(transaction)}`}
        >
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onView(transaction)}>
          <EyeIcon />
          View
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onEdit(transaction)}>
          <PencilLineIcon />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onDuplicate(transaction)}>
          <CopyIcon />
          Duplicate
        </DropdownMenuItem>
        {onReverse && canReverse(transaction) ? (
          <DropdownMenuItem onSelect={() => onReverse(transaction)}>
            <RotateCcwIcon />
            Reverse
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => onDelete(transaction)}
        >
          <Trash2Icon />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DetailSheet({
  transaction,
  baseCurrency,
  exchangeRate,
  onClose,
  onEdit,
  onDelete,
}: {
  transaction: Transaction | null;
  baseCurrency: string;
  exchangeRate?: string;
  onClose: () => void;
  onEdit: (item: Transaction) => void;
  onDelete: (item: Transaction) => void;
}) {
  if (!transaction) return null;
  const converted = convertAmount(
    transaction.amount,
    transaction.currency,
    baseCurrency,
    exchangeRate,
  );
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{displayText(transaction)}</SheetTitle>
          <SheetDescription>
            {transactionAmount(transaction)} ·{" "}
            {getTransactionTypeLabel(transaction.type)}
          </SheetDescription>
        </SheetHeader>
        <dl className="grid px-4">
          <Detail label="Direction" value={directionLabel(transaction)} />
          <Detail
            label="Date and time"
            value={formatDateTime(transaction.occurredAt)}
          />
          <Detail label="Account" value={transaction.accountName} />
          {transaction.investmentDetail?.pairLabel ? (
            <>
              <Detail
                label="Pair"
                value={transaction.investmentDetail.pairLabel}
              />
              <Detail
                label={
                  transaction.type === "INVESTMENT_BUY"
                    ? "Stablecoin paid"
                    : "Stablecoin received"
                }
                value={`${transaction.investmentDetail.settlementQuantity ?? "0"} ${transaction.investmentDetail.settlementAssetSymbol ?? ""}`.trim()}
              />
            </>
          ) : null}
          {transaction.destinationAccountName ? (
            <Detail
              label="Destination"
              value={transaction.destinationAccountName}
            />
          ) : null}
          <Detail
            label="Category"
            value={transaction.category || "Uncategorized"}
          />
          <Detail
            label="Labels"
            value={transaction.labels.join(", ") || "None"}
          />
          <Detail label="Status" value={statusLabel(transaction.status)} />
          {transaction.merchant ? (
            <Detail label="Merchant or payee" value={transaction.merchant} />
          ) : null}
          {transaction.notes ? (
            <Detail label="Note" value={transaction.notes} />
          ) : null}
          {transaction.reference ? (
            <Detail label="Reference" value={transaction.reference} />
          ) : null}
          {converted ? (
            <Detail label={`Converted (${baseCurrency})`} value={converted} />
          ) : null}
          {converted && exchangeRate ? (
            <Detail label="Exchange rate" value={exchangeRate} />
          ) : null}
          <Detail
            label="Created"
            value={formatDateTime(transaction.createdAt)}
          />
          <Detail
            label="Last updated"
            value={formatDateTime(transaction.updatedAt)}
          />
        </dl>
        <SheetFooter className="flex-row">
          <Button className="flex-1" onClick={() => onEdit(transaction)}>
            <PencilLineIcon />
            Edit
          </Button>
          <Button
            className="flex-1"
            variant="destructive"
            onClick={() => onDelete(transaction)}
          >
            <Trash2Icon />
            Delete
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-3 border-b py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words text-right">{value}</dd>
    </div>
  );
}
function Labels({ labels }: { labels: readonly string[] }) {
  return (
    <div className="flex gap-1" title={labels.join(", ")}>
      {labels.slice(0, 2).map((label) => (
        <Badge key={label} variant="outline">
          {label}
        </Badge>
      ))}
      {labels.length > 2 ? (
        <Badge variant="outline">+{labels.length - 2}</Badge>
      ) : null}
      {!labels.length ? <span className="text-muted-foreground">—</span> : null}
    </div>
  );
}
function Status({ status }: { status: TransactionStatus }) {
  return (
    <Badge
      variant={
        status === "FAILED" || status === "VOIDED"
          ? "outline"
          : status === "PENDING"
            ? "secondary"
            : "default"
      }
    >
      {statusLabel(status)}
    </Badge>
  );
}

function SortHead({
  label,
  value,
  filters,
  onSort,
  className,
}: {
  label: string;
  value: TransactionFilters["sortBy"];
  filters: TransactionFilters;
  onSort: (value: TransactionFilters["sortBy"]) => void;
  className?: string;
}) {
  const active = filters.sortBy === value;
  return (
    <TableHead
      className={className}
      aria-sort={
        active
          ? filters.sortDirection === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3"
        onClick={() => onSort(value)}
      >
        {label}
        {active ? (
          filters.sortDirection === "asc" ? (
            <ArrowUpIcon />
          ) : (
            <ArrowDownIcon />
          )
        ) : (
          <ArrowUpDownIcon />
        )}
      </Button>
    </TableHead>
  );
}
function Pagination({
  meta,
  onPage,
  onPageSize,
}: {
  meta:
    | { page: number; pageSize: number; pageCount: number; total: number }
    | undefined;
  onPage: (page: number) => void;
  onPageSize: (size: string) => void;
}) {
  if (!meta) return null;
  const first = meta.total ? (meta.page - 1) * meta.pageSize + 1 : 0;
  const last = Math.min(meta.page * meta.pageSize, meta.total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
      <p className="text-sm text-muted-foreground">
        {first}–{last} of {meta.total}
      </p>
      <div className="flex items-center gap-2">
        <Label htmlFor="page-size" className="text-xs">
          Rows
        </Label>
        <Select value={String(meta.pageSize)} onValueChange={onPageSize}>
          <SelectTrigger id="page-size" className="w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[25, 50, 100].map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="icon-sm"
          variant="outline"
          aria-label="Previous page"
          disabled={meta.page <= 1}
          onClick={() => onPage(meta.page - 1)}
        >
          <ChevronLeftIcon />
        </Button>
        <span className="min-w-16 text-center text-sm">
          {meta.page} / {meta.pageCount}
        </span>
        <Button
          size="icon-sm"
          variant="outline"
          aria-label="Next page"
          disabled={meta.page >= meta.pageCount}
          onClick={() => onPage(meta.page + 1)}
        >
          <ChevronRightIcon />
        </Button>
      </div>
    </div>
  );
}
function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card>
      <CardContent className="grid gap-1 p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="truncate text-xl font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function AccountOverview({ account }: { readonly account: Account }) {
  return (
    <section
      className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
      aria-label="Account balances and details"
    >
      {account.type !== "CRYPTO_WALLET" ? (
        <>
          <SummaryCard
            label="Current balance"
            value={formatAmount(account.currentBalance, account.currency)}
            detail="Complete account balance"
          />
          <SummaryCard
            label="Opening balance"
            value={formatAmount(account.openingBalance, account.currency)}
            detail={`Opened ${formatDate(account.openedAt)}`}
          />
        </>
      ) : null}
      <Card
        className={cn(
          "md:col-span-2",
          account.type === "CRYPTO_WALLET" && "xl:col-span-4",
        )}
      >
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Account type</p>
            <p className="font-medium">{getAccountTypeLabel(account.type)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Currency</p>
            <p className="font-mono font-medium">{account.currency}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Last updated</p>
            <p className="font-medium">{formatDateTime(account.updatedAt)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Status</p>
            <p className="font-medium">
              {account.archivedAt ? "Archived" : "Active"}
            </p>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function AccountHeaderSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <Skeleton className="h-24" />
      <Skeleton className="h-24" />
      <Skeleton className="h-24 md:col-span-2" />
    </div>
  );
}
function TableSkeleton() {
  return (
    <div className="grid gap-2" aria-label="Loading transactions">
      {Array.from({ length: 7 }).map((_, index) => (
        <Skeleton key={index} className="h-14" />
      ))}
    </div>
  );
}

function getFilterChips(filters: TransactionFilters) {
  const chips: { key: string; value: string; label: string }[] = [];
  if (filters.datePreset !== "thisMonth")
    chips.push({
      key: "date",
      value: filters.datePreset,
      label: getDatePresetLabel(filters.datePreset),
    });
  filters.accountIds.forEach((value) =>
    chips.push({ key: "accounts", value, label: "Account selected" }),
  );
  filters.types.forEach((value) =>
    chips.push({ key: "types", value, label: getTransactionTypeLabel(value) }),
  );
  filters.categories.forEach((value) =>
    chips.push({ key: "categories", value, label: value }),
  );
  filters.labels.forEach((value) =>
    chips.push({ key: "labels", value, label: `Label: ${value}` }),
  );
  filters.statuses.forEach((value) =>
    chips.push({ key: "statuses", value, label: statusLabel(value) }),
  );
  if (filters.direction)
    chips.push({
      key: "direction",
      value: filters.direction,
      label: filters.direction === "IN" ? "Money in" : "Money out",
    });
  if (filters.minAmount)
    chips.push({
      key: "minAmount",
      value: filters.minAmount,
      label: `Min ${filters.minAmount}`,
    });
  if (filters.maxAmount)
    chips.push({
      key: "maxAmount",
      value: filters.maxAmount,
      label: `Max ${filters.maxAmount}`,
    });
  filters.currencies.forEach((value) =>
    chips.push({ key: "currencies", value, label: value }),
  );
  if (filters.hasNote)
    chips.push({ key: "hasNote", value: "true", label: "Has note" });
  if (filters.uncategorizedOnly)
    chips.push({ key: "uncategorized", value: "true", label: "Uncategorized" });
  return chips;
}
function removeChip(
  key: string,
  value: string,
  filters: TransactionFilters,
  updateUrl: FilterProps["updateUrl"],
) {
  const arrays: Record<string, readonly string[]> = {
    accounts: filters.accountIds,
    types: filters.types,
    categories: filters.categories,
    labels: filters.labels,
    statuses: filters.statuses,
    currencies: filters.currencies,
  };
  if (arrays[key])
    updateUrl(
      key,
      arrays[key].filter((item) => item !== value),
    );
  else if (key === "date") updateUrl(key, "thisMonth");
  else updateUrl(key, undefined);
}
function confirmationText(action: Confirmation) {
  if (!action) return "";
  if (action.kind === "bulk-delete")
    return `This soft-deletes ${action.count} selected transactions in one request. Linked transfers stop affecting both accounts.`;
  const item = action.transaction;
  const detail = `${displayText(item)}, ${formatAmount(item.amount, item.currency)}, ${formatDate(item.occurredAt)}, from ${item.accountName}.`;
  if (action.kind === "reverse")
    return `Reverse ${detail} A corrective transaction preserves the original record.`;
  return `Delete ${detail}${isTransferType(item.type) ? " The linked transfer will stop affecting both accounts." : ""} It will no longer affect balances or summaries.`;
}
function canReverse(item: Transaction) {
  return (
    item.status === "CLEARED" &&
    isReversibleType(item.type) &&
    !item.reversalOfId &&
    !item.reversedById
  );
}
function displayText(item: Transaction) {
  return item.description || item.merchant || item.category || "Transaction";
}
function amountColor(item: Transaction) {
  if (
    item.status === "FAILED" ||
    item.status === "VOIDED" ||
    (!item.accountDirection && isTransferType(item.type))
  )
    return "text-muted-foreground";
  if (item.accountDirection)
    return item.accountDirection === "IN"
      ? "text-emerald-600 dark:text-emerald-400"
      : item.accountDirection === "OUT"
        ? "text-foreground"
        : "text-muted-foreground";
  return getTransactionSign(item.type) > 0
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-foreground";
}
function transactionAmount(item: Transaction) {
  const investment = item.investmentDetail;
  if (
    investment?.settlementAssetSymbol &&
    investment.settlementQuantity &&
    (item.type === "INVESTMENT_BUY" || item.type === "INVESTMENT_SELL")
  ) {
    const asset = investment.assetSymbol ?? investment.assetName;
    return item.type === "INVESTMENT_BUY"
      ? `+${investment.quantity} ${asset} / −${investment.settlementQuantity} ${investment.settlementAssetSymbol}`
      : `−${investment.quantity} ${asset} / +${investment.settlementQuantity} ${investment.settlementAssetSymbol}`;
  }
  if (item.accountEffect !== undefined)
    return item.accountDirection === "NEUTRAL"
      ? formatAmount(item.accountEffect, item.currency)
      : formatSignedAmount(item.accountEffect, item.currency);
  const sign = isTransferType(item.type)
    ? "↔ "
    : getTransactionSign(item.type) > 0
      ? "+"
      : getTransactionSign(item.type) < 0
        ? "−"
        : "";
  return `${sign}${formatAmount(item.amount, item.currency)}`;
}
function statusLabel(status: TransactionStatus) {
  return (
    transactionStatusOptions.find((option) => option.value === status)?.label ??
    status
  );
}
function directionLabel(item: Transaction) {
  if (item.accountDirection)
    return item.accountDirection === "IN"
      ? "Money in"
      : item.accountDirection === "OUT"
        ? "Money out"
        : "Neutral";
  if (isTransferType(item.type)) return "Transfer";
  const sign = getTransactionSign(item.type);
  return sign > 0 ? "Money in" : sign < 0 ? "Money out" : "Neutral";
}

function getCommonCategories(
  types: readonly TransactionType[],
  categories?: TransactionCategories,
): readonly string[] {
  if (!categories || types.length === 0) return [];
  const uniqueTypes = [...new Set(types)];
  return categories[uniqueTypes[0]].filter((category) =>
    uniqueTypes.every((type) => categories[type].includes(category)),
  );
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(value),
  );
}
function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
function convertAmount(
  amount: string,
  currency: string,
  baseCurrency: string,
  exchangeRate?: string,
) {
  if (currency === baseCurrency || !exchangeRate) return null;
  const rate = Number(exchangeRate);
  const numeric = Number(amount);
  if (!Number.isFinite(rate) || !Number.isFinite(numeric) || rate <= 0)
    return null;
  const converted =
    currency === "USD" && baseCurrency === "PKR"
      ? numeric * rate
      : currency === "PKR" && baseCurrency === "USD"
        ? numeric / rate
        : null;
  return converted === null
    ? null
    : formatAmount(String(converted), baseCurrency);
}
