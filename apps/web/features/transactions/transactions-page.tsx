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
  accountsQueryKey,
  listAccounts,
} from "@/features/accounts/accounts-api";
import {
  getAccountTypeLabel,
  type AccountType,
} from "@/features/accounts/account-types";
import { assetsQueryKey, listAssets } from "@/features/assets/assets-api";
import { dashboardQueryKey } from "@/features/dashboard/dashboard-api";
import {
  holdingsQueryKey,
  listHoldings,
} from "@/features/investments/investments-api";
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
import type { TransactionFormPayload } from "./transaction-form-schema";
import {
  bulkUpdateTransactions,
  createTransaction,
  deleteTransaction,
  listTransactions,
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

const categorisableTypes = new Set<TransactionType>([
  "INCOME",
  "EXPENSE",
  "REFUND",
  "FEE",
  "DIVIDEND",
  "INTEREST",
  "ADJUSTMENT",
]);

export function TransactionsPage() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = useMemo(
    () => readTransactionFilters(searchParams),
    [searchParams],
  );
  const [searchText, setSearchText] = useState(filters.search);
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [details, setDetails] = useState<Transaction | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  const listParams = useMemo(
    () => toTransactionListParams(filters, debouncedSearch),
    [filters, debouncedSearch],
  );
  const listKey = useMemo(() => JSON.stringify(listParams), [listParams]);
  const accountsQuery = useQuery({
    queryKey: accountsQueryKey,
    queryFn: () => listAccounts(getToken),
  });
  const assetsQuery = useQuery({
    queryKey: assetsQueryKey,
    queryFn: () => listAssets(getToken),
  });
  const holdingsQuery = useQuery({
    queryKey: [...holdingsQueryKey, "NATIVE"],
    queryFn: () => listHoldings(getToken, "NATIVE"),
  });
  const settingsQuery = useQuery({
    queryKey: settingsQueryKey,
    queryFn: () => getSettings(getToken),
  });
  const transactionsQuery = useQuery({
    queryKey: [...transactionsQueryKey, listKey],
    queryFn: () => listTransactions(getToken, listParams),
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

  const accounts = accountsQuery.data ?? [];
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
  const hasError =
    accountsQuery.isError ||
    assetsQuery.isError ||
    holdingsQuery.isError ||
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
    ]);
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
    updateUrl,
    toggleArrayFilter,
  };

  return (
    <AppShell
      currentSection="transactions"
      title="Transactions"
      description="View and manage activity across all accounts."
      primaryAction={
        <Button
          size="sm"
          disabled={!accounts.length}
          onClick={() => setDialog({ mode: "create" })}
        >
          <PlusIcon data-icon="inline-start" />
          Add transaction
        </Button>
      }
    >
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
        {hasError ? (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>Unable to load transactions</AlertTitle>
            <AlertDescription className="flex items-center justify-between gap-3">
              <span>
                {transactionsQuery.error?.message ??
                  accountsQuery.error?.message ??
                  assetsQuery.error?.message ??
                  holdingsQuery.error?.message}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void transactionsQuery.refetch()}
              >
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        <section
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          aria-label="Filtered transaction summary"
        >
          <SummaryCard
            label="Money in"
            value={
              meta ? formatAmount(meta.summary.moneyIn, meta.baseCurrency) : "—"
            }
            detail={`Base currency: ${meta?.baseCurrency ?? "—"}`}
          />
          <SummaryCard
            label="Money out"
            value={
              meta
                ? formatAmount(meta.summary.moneyOut, meta.baseCurrency)
                : "—"
            }
            detail="Transfers and investments excluded"
          />
          <SummaryCard
            label="Net cash flow"
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

        <Card>
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
                canCategorize={
                  selectedTransactions.length > 0 &&
                  selectedTransactions.every((item) =>
                    categorisableTypes.has(item.type),
                  )
                }
                categories={meta?.filterOptions.categories ?? []}
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
                      disabled={!accounts.length}
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
        transaction={dialog?.transaction ?? null}
        accounts={accounts}
        assets={assetsQuery.data ?? []}
        holdings={holdingsQuery.data ?? []}
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
      {currencies.length > 1 ? (
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
          aria-label={`Select ${transaction.description}`}
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
    <button
      type="button"
      className="grid w-full gap-3 rounded-lg border p-4 text-left"
      onClick={() => actions.onView(transaction)}
    >
      <div className="flex items-start justify-between gap-3">
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
      <div className="flex items-center gap-2">
        <Badge variant="secondary">
          {getTransactionTypeLabel(transaction.type)}
        </Badge>
        <Status status={transaction.status} />
        <span className="ml-auto" onClick={(event) => event.stopPropagation()}>
          <Actions transaction={transaction} {...actions} />
        </span>
      </div>
    </button>
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
          aria-label={`Actions for ${transaction.description}`}
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
          <SheetTitle>{transaction.description}</SheetTitle>
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
  const detail = `${item.description}, ${formatAmount(item.amount, item.currency)}, ${formatDate(item.occurredAt)}, from ${item.accountName}.`;
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
    isTransferType(item.type)
  )
    return "text-muted-foreground";
  return getTransactionSign(item.type) > 0
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-foreground";
}
function transactionAmount(item: Transaction) {
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
  if (isTransferType(item.type)) return "Transfer";
  const sign = getTransactionSign(item.type);
  return sign > 0 ? "Money in" : sign < 0 ? "Money out" : "Neutral";
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
