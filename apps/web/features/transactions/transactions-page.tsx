"use client"

import { useAuth } from "@clerk/nextjs"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import {
  ArrowLeftRightIcon,
  CircleAlertIcon,
  PencilLineIcon,
  PlusIcon,
  ReceiptTextIcon,
  RefreshCcwIcon,
  RotateCcwIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react"

import {
  accountsQueryKey,
  listAccounts,
} from "@/features/accounts/accounts-api"
import { assetsQueryKey, listAssets } from "@/features/assets/assets-api"
import { dashboardQueryKey } from "@/features/dashboard/dashboard-api"
import { getSettings, settingsQueryKey } from "@/features/settings/settings-api"

import { AppShell } from "@/components/app-shell"
import { cn } from "@/lib/utils"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import { TransactionFormDialog } from "./transaction-form-dialog"
import { type TransactionFormPayload } from "./transaction-form-schema"
import {
  createTransaction,
  deleteTransaction,
  listTransactions,
  reverseTransaction,
  transactionsQueryKey,
  updateTransaction,
} from "./transactions-api"
import {
  getTransactionSign,
  getTransactionTypeLabel,
  isReversibleType,
  isTransferType,
  type Transaction,
} from "./transaction-types"

type TransactionDialogState =
  | { readonly mode: "create" }
  | { readonly mode: "edit"; readonly transaction: Transaction }
  | null

type ConfirmationAction =
  | { readonly kind: "delete"; readonly transaction: Transaction }
  | { readonly kind: "reverse"; readonly transaction: Transaction }
  | null

export function TransactionsPage() {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  const [dialogState, setDialogState] = useState<TransactionDialogState>(null)
  const [confirmation, setConfirmation] = useState<ConfirmationAction>(null)
  const [searchQuery, setSearchQuery] = useState("")

  const accountsQuery = useQuery({
    queryKey: accountsQueryKey,
    queryFn: () => listAccounts(getToken),
  })

  const assetsQuery = useQuery({
    queryKey: assetsQueryKey,
    queryFn: () => listAssets(getToken),
  })

  const transactionsQuery = useQuery({
    queryKey: transactionsQueryKey,
    queryFn: () => listTransactions(getToken),
  })

  const settingsQuery = useQuery({
    queryKey: settingsQueryKey,
    queryFn: () => getSettings(getToken),
  })

  const saveTransactionMutation = useMutation({
    mutationFn: async ({
      mode,
      transactionId,
      payload,
    }: {
      readonly mode: "create" | "edit"
      readonly payload: TransactionFormPayload
      readonly transactionId?: string
    }) => {
      if (mode === "create") {
        return createTransaction(getToken, {
          ...payload,
          idempotencyKey: crypto.randomUUID(),
        })
      }

      if (!transactionId) {
        throw new Error("Transaction id is required to update a transaction.")
      }

      return updateTransaction(getToken, transactionId, payload)
    },
  })

  const reverseTransactionMutation = useMutation({
    mutationFn: async (transactionId: string) =>
      reverseTransaction(getToken, transactionId),
  })

  const deleteTransactionMutation = useMutation({
    mutationFn: async (transactionId: string) =>
      deleteTransaction(getToken, transactionId),
  })

  const accounts = accountsQuery.data ?? []
  const assets = assetsQuery.data ?? []
  const transactions = useMemo(
    () => transactionsQuery.data ?? [],
    [transactionsQuery.data]
  )

  const filteredTransactions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    if (!query) {
      return transactions
    }

    return transactions.filter((transaction) => {
      const searchable = [
        transaction.description,
        transaction.merchant ?? "",
        transaction.notes ?? "",
        transaction.accountName,
        transaction.destinationAccountName ?? "",
        getTransactionTypeLabel(transaction.type),
      ]
        .join(" ")
        .toLowerCase()

      return searchable.includes(query)
    })
  }, [transactions, searchQuery])

  const totalVolume = useMemo(
    () =>
      transactions.reduce(
        (sum, transaction) => sum + Math.abs(Number(transaction.amount)),
        0
      ),
    [transactions]
  )

  const reversibleCount = useMemo(
    () =>
      transactions.filter(
        (transaction) =>
          isReversibleType(transaction.type) &&
          !transaction.reversalOfId &&
          !transaction.reversedById
      ).length,
    [transactions]
  )

  const hasError =
    accountsQuery.isError || assetsQuery.isError || transactionsQuery.isError
  const isLoading =
    accountsQuery.isLoading || assetsQuery.isLoading || transactionsQuery.isLoading

  async function handleSaveTransaction(
    payload: TransactionFormPayload
  ): Promise<void> {
    if (!dialogState) {
      return
    }

    await saveTransactionMutation.mutateAsync({
      mode: dialogState.mode,
      transactionId:
        dialogState.mode === "edit" ? dialogState.transaction.id : undefined,
      payload,
    })

    setDialogState(null)
    await invalidateTransactionData()
  }

  async function handleReverseTransaction(): Promise<void> {
    if (!confirmation || confirmation.kind !== "reverse") {
      return
    }

    await reverseTransactionMutation.mutateAsync(confirmation.transaction.id)
    setConfirmation(null)
    await invalidateTransactionData()
  }

  async function handleDeleteTransaction(): Promise<void> {
    if (!confirmation || confirmation.kind !== "delete") {
      return
    }

    await deleteTransactionMutation.mutateAsync(confirmation.transaction.id)
    setConfirmation(null)
    await invalidateTransactionData()
  }

  async function invalidateTransactionData(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: transactionsQueryKey }),
      queryClient.invalidateQueries({ queryKey: accountsQueryKey }),
      queryClient.invalidateQueries({ queryKey: assetsQueryKey }),
      queryClient.invalidateQueries({ queryKey: dashboardQueryKey }),
    ])
  }

  return (
    <AppShell
      currentSection="transactions"
      title="Transactions"
      description="Record, review, edit, and reverse account activity."
      primaryAction={
        <Button
          size="sm"
          onClick={() => setDialogState({ mode: "create" })}
          disabled={accounts.length === 0}
        >
          <PlusIcon data-icon="inline-start" />
          Add transaction
        </Button>
      }
    >
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
        {hasError ? (
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden="true" />
            <AlertTitle>Unable to load transactions</AlertTitle>
            <AlertDescription>
              {accountsQuery.error?.message ??
                assetsQuery.error?.message ??
                transactionsQuery.error?.message}
            </AlertDescription>
          </Alert>
        ) : null}

        <section className="grid gap-4 md:grid-cols-3">
          <SummaryCard
            label="Total transactions"
            value={isLoading ? "..." : String(transactions.length)}
            detail="Recorded account activity"
          />
          <SummaryCard
            label="Transaction volume"
            value={
              isLoading
                ? "..."
                : formatVolume(
                    totalVolume,
                    settingsQuery.data?.baseCurrency ??
                      accounts[0]?.currency ??
                      "USD"
                  )
            }
            detail="Sum of absolute amounts"
          />
          <SummaryCard
            label="Reversible"
            value={isLoading ? "..." : String(reversibleCount)}
            detail="Transactions that can be reversed"
          />
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Transaction history</CardTitle>
            <CardDescription>
              All recorded activity tied to your accounts. Use the search box to
              filter by description, merchant, or account.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="relative">
              <SearchIcon
                aria-hidden="true"
                className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                placeholder="Search transactions..."
                className="pl-9"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>

            {accounts.length === 0 && !isLoading ? (
              <Alert>
                <CircleAlertIcon aria-hidden="true" />
                <AlertTitle>No accounts available</AlertTitle>
                <AlertDescription>
                  Create at least one account before recording transactions.
                </AlertDescription>
              </Alert>
            ) : null}

            {isLoading ? (
              <TransactionsTableSkeleton />
            ) : transactions.length === 0 ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ReceiptTextIcon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>No transactions yet</EmptyTitle>
                  <EmptyDescription>
                    Add your first income, expense, transfer, or investment
                    transaction to start tracking account activity.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button
                    onClick={() => setDialogState({ mode: "create" })}
                    disabled={accounts.length === 0}
                  >
                    <PlusIcon data-icon="inline-start" />
                    Create transaction
                  </Button>
                </EmptyContent>
              </Empty>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransactions.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="h-24 text-center text-muted-foreground"
                        >
                          No transactions match your search.
                        </TableCell>
                      </TableRow>
                    ) : null}
                    {filteredTransactions.map((transaction) => (
                      <TableRow
                        key={transaction.id}
                        data-muted={Boolean(transaction.reversalOfId)}
                        className="data-[muted=true]:opacity-60"
                      >
                        <TableCell>{formatDate(transaction.occurredAt)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {getTransactionTypeLabel(transaction.type)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="truncate">
                              {transaction.accountName}
                            </span>
                            {isTransferType(transaction.type) &&
                            transaction.destinationAccountName ? (
                              <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                                <ArrowLeftRightIcon
                                  aria-hidden="true"
                                  className="size-3"
                                />
                                {transaction.destinationAccountName}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="truncate">
                              {transaction.description}
                            </span>
                            {transaction.merchant ? (
                              <span className="truncate text-xs text-muted-foreground">
                                {transaction.merchant}
                              </span>
                            ) : null}
                            {transaction.investmentDetail ? (
                              <span className="truncate text-xs text-muted-foreground">
                                {transaction.investmentDetail.assetName}
                                {transaction.investmentDetail.assetSymbol
                                  ? ` (${transaction.investmentDetail.assetSymbol})`
                                  : null}
                                {" · "}
                                {transaction.investmentDetail.quantity} @{" "}
                                {transaction.investmentDetail.price}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-mono font-medium",
                            getAmountColor(transaction)
                          )}
                        >
                          {formatTransactionAmount(transaction)}
                        </TableCell>
                        <TableCell>
                          {transaction.reversalOfId ? (
                            <Badge variant="outline">Reversal</Badge>
                          ) : transaction.reversedById ? (
                            <Badge variant="outline">Reversed</Badge>
                          ) : (
                            <Badge variant="secondary">Recorded</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setDialogState({
                                  mode: "edit",
                                  transaction,
                                })
                              }
                            >
                              <PencilLineIcon data-icon="inline-start" />
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!canReverse(transaction)}
                              onClick={() =>
                                setConfirmation({
                                  kind: "reverse",
                                  transaction,
                                })
                              }
                            >
                              <RotateCcwIcon data-icon="inline-start" />
                              Reverse
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() =>
                                setConfirmation({
                                  kind: "delete",
                                  transaction,
                                })
                              }
                            >
                              <Trash2Icon data-icon="inline-start" />
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <TransactionFormDialog
        open={dialogState !== null}
        mode={dialogState?.mode ?? "create"}
        transaction={
          dialogState?.mode === "edit" ? dialogState.transaction : null
        }
        accounts={accounts}
        assets={assets}
        defaultCurrency={
          (settingsQuery.data?.baseCurrency === "PKR" ? "PKR" : "USD") as
            | "USD"
            | "PKR"
        }
        isPending={saveTransactionMutation.isPending}
        errorMessage={
          saveTransactionMutation.isError
            ? saveTransactionMutation.error.message
            : null
        }
        onOpenChange={(open) => {
          if (!open) {
            setDialogState(null)
            saveTransactionMutation.reset()
          }
        }}
        onSubmit={handleSaveTransaction}
      />

      <AlertDialog
        open={confirmation?.kind === "reverse"}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmation(null)
            reverseTransactionMutation.reset()
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <RefreshCcwIcon aria-hidden="true" />
            </AlertDialogMedia>
            <AlertDialogTitle>Reverse transaction</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation?.kind === "reverse"
                ? `Reverse "${confirmation.transaction.description}"? This will create a linked corrective transaction that restores the account balance while keeping the original record.`
                : "Reverse this transaction?"}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {reverseTransactionMutation.isError ? (
            <Alert variant="destructive">
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>Reverse failed</AlertTitle>
              <AlertDescription>
                {reverseTransactionMutation.error.message}
              </AlertDescription>
            </Alert>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={reverseTransactionMutation.isPending}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={reverseTransactionMutation.isPending}
              onClick={async (event) => {
                event.preventDefault()
                await handleReverseTransaction()
              }}
            >
              {reverseTransactionMutation.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <RotateCcwIcon data-icon="inline-start" />
              )}
              Reverse transaction
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmation?.kind === "delete"}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmation(null)
            deleteTransactionMutation.reset()
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2Icon aria-hidden="true" />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete transaction</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation?.kind === "delete"
                ? `Delete "${confirmation.transaction.description}"? The amount will be reversed to the account. This action is intended for correcting erroneous entries.`
                : "Delete this transaction?"}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {deleteTransactionMutation.isError ? (
            <Alert variant="destructive">
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>Delete failed</AlertTitle>
              <AlertDescription>
                {deleteTransactionMutation.error.message}
              </AlertDescription>
            </Alert>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleteTransactionMutation.isPending}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteTransactionMutation.isPending}
              onClick={async (event) => {
                event.preventDefault()
                await handleDeleteTransaction()
              }}
            >
              {deleteTransactionMutation.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Trash2Icon data-icon="inline-start" />
              )}
              Delete transaction
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  )
}

function SummaryCard({
  detail,
  label,
  value,
}: {
  readonly detail: string
  readonly label: string
  readonly value: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <CardDescription>{detail}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="font-mono text-2xl font-semibold tracking-normal">{value}</p>
      </CardContent>
    </Card>
  )
}

function TransactionsTableSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.4fr)] gap-3"
        >
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
        </div>
      ))}
    </div>
  )
}

function canReverse(transaction: Transaction): boolean {
  return (
    isReversibleType(transaction.type) &&
    !transaction.reversalOfId &&
    !transaction.reversedById
  )
}

function getAmountColor(transaction: Transaction): string {
  if (transaction.reversalOfId) {
    return "text-muted-foreground"
  }

  const sign = getTransactionSign(transaction.type)
  const numericAmount = Number(transaction.amount)
  const effectiveSign = transaction.type === "ADJUSTMENT" ? numericAmount : sign

  if (effectiveSign > 0) {
    return "text-[var(--state-success)]"
  }

  if (effectiveSign < 0) {
    return "text-[var(--state-error)]"
  }

  return "text-foreground"
}

function formatTransactionAmount(transaction: Transaction): string {
  const sign = getTransactionSign(transaction.type)
  const numericAmount = Number(transaction.amount)
  const effectiveAmount =
    transaction.type === "ADJUSTMENT" ? numericAmount : sign * numericAmount

  return formatAmount(effectiveAmount, transaction.currency)
}

function formatAmount(amount: number, currency: string): string {
  const isNegative = amount < 0
  const absoluteAmount = Math.abs(amount)
  const formatted = new Intl.NumberFormat("en", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  }).format(absoluteAmount)

  return `${isNegative ? "-" : "+"} ${currency} ${formatted}`
}

function formatVolume(amount: number, currency: string): string {
  const formatted = new Intl.NumberFormat("en", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  }).format(amount)

  return `${currency} ${formatted}`
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value))
}
