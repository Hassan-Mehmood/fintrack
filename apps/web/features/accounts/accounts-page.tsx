"use client"

import { useAuth } from "@clerk/nextjs"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import Link from "next/link"
import {
  CheckIcon,
  CircleAlertIcon,
  EyeIcon,
  GripVerticalIcon,
  PencilLineIcon,
  PlusIcon,
  Trash2Icon,
  WalletCardsIcon,
  XIcon,
} from "lucide-react"

import { AppShell } from "@/components/app-shell"
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
  CardAction,
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

import { formatAmount, formatDate } from "@/lib/formatting"

import { AdjustBalanceDialog } from "./adjust-balance-dialog"
import { moveAccountId } from "./account-order"
import { AccountFormDialog } from "./account-form-dialog"
import { type AccountFormPayload } from "./account-form-schema"
import { dashboardQueryKey } from "@/features/dashboard/dashboard-api"
import { getSettings, settingsQueryKey } from "@/features/settings/settings-api"

import {
  accountsQueryKey,
  createAccount,
  deleteAccount,
  listAccounts,
  reorderAccounts,
  updateAccount,
} from "./accounts-api"
import { getAccountTypeLabel, type Account } from "./account-types"

type AccountDialogState =
  | { readonly mode: "create" }
  | { readonly account: Account; readonly mode: "edit" }
  | null

export function AccountsPage() {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  const [dialogState, setDialogState] = useState<AccountDialogState>(null)
  const [accountToAdjust, setAccountToAdjust] = useState<Account | null>(null)
  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null)
  const [draggedAccountId, setDraggedAccountId] = useState<string | null>(null)
  const [draftAccountIds, setDraftAccountIds] = useState<
    readonly string[] | null
  >(null)

  const accountsQuery = useQuery({
    queryKey: accountsQueryKey,
    queryFn: () => listAccounts(getToken, "MONEY"),
  })

  const settingsQuery = useQuery({
    queryKey: settingsQueryKey,
    queryFn: () => getSettings(getToken),
  })

  const saveAccountMutation = useMutation({
    mutationFn: async ({
      accountId,
      mode,
      payload,
    }: {
      readonly accountId?: string
      readonly mode: "create" | "edit"
      readonly payload: AccountFormPayload
    }) => {
      if (mode === "create") {
        return createAccount(getToken, payload)
      }

      if (!accountId) {
        throw new Error("Account id is required to update an account.")
      }

      return updateAccount(getToken, accountId, payload)
    },
  })

  const deleteAccountMutation = useMutation({
    mutationFn: async (accountId: string) => deleteAccount(getToken, accountId),
  })
  const reorderAccountsMutation = useMutation({
    mutationFn: (accountIds: readonly string[]) =>
      reorderAccounts(getToken, accountIds),
  })

  const savedAccounts = accountsQuery.data ?? []
  const savedAccountIds = savedAccounts.map((account) => account.id)
  const accounts = draftAccountIds
    ? [
        ...draftAccountIds
          .map((accountId) =>
            savedAccounts.find((account) => account.id === accountId),
          )
          .filter((account): account is Account => Boolean(account)),
        ...savedAccounts.filter(
          (account) => !draftAccountIds.includes(account.id),
        ),
      ]
    : savedAccounts
  const hasDraftAccountOrder = draftAccountIds !== null
  const totalAccounts = accounts.length
  const currenciesCount = new Set(accounts.map((account) => account.currency))
    .size

  async function handleSaveAccount(payload: AccountFormPayload): Promise<void> {
    if (!dialogState) {
      return
    }

    await saveAccountMutation.mutateAsync({
      accountId:
        dialogState.mode === "edit" ? dialogState.account.id : undefined,
      mode: dialogState.mode,
      payload,
    })

    setDialogState(null)
    setDraftAccountIds(null)
    await invalidateAccountData()
  }

  async function invalidateAccountData(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: accountsQueryKey }),
      queryClient.invalidateQueries({ queryKey: dashboardQueryKey }),
    ])
  }

  async function handleDeleteAccount(): Promise<void> {
    if (!accountToDelete) {
      return
    }

    await deleteAccountMutation.mutateAsync(accountToDelete.id)
    setAccountToDelete(null)
    setDraftAccountIds(null)
    await invalidateAccountData()
  }

  async function persistAccountOrder() {
    if (!draftAccountIds) return

    const accountIds = accounts.map((account) => account.id)
    const persistedAccountIds =
      await reorderAccountsMutation.mutateAsync(accountIds)
    queryClient.setQueryData(
      accountsQueryKey,
      persistedAccountIds
        .map((accountId) =>
          accounts.find((account) => account.id === accountId),
        )
        .filter((account): account is Account => Boolean(account)),
    )
    setDraftAccountIds(null)
    await queryClient.invalidateQueries({ queryKey: accountsQueryKey })
  }

  function moveAccount(accountId: string, targetIndex: number) {
    if (reorderAccountsMutation.isPending) return
    const currentAccountIds = accounts.map((account) => account.id)
    const accountIds = moveAccountId(currentAccountIds, accountId, targetIndex)
    if (accountIds === currentAccountIds) return
    setDraftAccountIds(
      accountIds.every(
        (accountId, index) => accountId === savedAccountIds[index],
      )
        ? null
        : accountIds,
    )
    reorderAccountsMutation.reset()
  }

  return (
    <AppShell
      currentSection="accounts"
      title="Accounts"
      description="Manage bank accounts, cash wallets, and digital wallets."
      primaryAction={
        <Button size="sm" onClick={() => setDialogState({ mode: "create" })}>
          <PlusIcon data-icon="inline-start" />
          Add account
        </Button>
      }
    >
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
        {accountsQuery.isError ? (
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden="true" />
            <AlertTitle>Unable to load accounts</AlertTitle>
            <AlertDescription>{accountsQuery.error.message}</AlertDescription>
          </Alert>
        ) : null}
        {reorderAccountsMutation.isError ? (
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden="true" />
            <AlertTitle>Unable to reorder accounts</AlertTitle>
            <AlertDescription>
              {reorderAccountsMutation.error.message}
            </AlertDescription>
          </Alert>
        ) : null}

        <section className="grid gap-4 md:grid-cols-3">
          <SummaryCard
            label="Total accounts"
            value={accountsQuery.isLoading ? "..." : String(totalAccounts)}
            detail="Everyday money accounts"
          />
          <SummaryCard
            label="Currencies"
            value={accountsQuery.isLoading ? "..." : String(currenciesCount)}
            detail="Distinct reporting currencies"
          />
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Managed accounts</CardTitle>
            <CardDescription>
              Bank accounts, physical cash, and digital wallets stay separate
              from Stocks and Crypto.
            </CardDescription>
            {hasDraftAccountOrder ? (
              <CardAction className="flex items-center gap-1">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={reorderAccountsMutation.isPending}
                  aria-label="Cancel account order changes"
                  title="Cancel order changes"
                  onClick={() => {
                    setDraftAccountIds(null)
                    reorderAccountsMutation.reset()
                  }}
                >
                  <XIcon />
                </Button>
                <Button
                  size="icon-sm"
                  disabled={reorderAccountsMutation.isPending}
                  aria-label="Save account order"
                  title="Save account order"
                  onClick={() => void persistAccountOrder()}
                >
                  {reorderAccountsMutation.isPending ? (
                    <Spinner />
                  ) : (
                    <CheckIcon />
                  )}
                </Button>
              </CardAction>
            ) : null}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {accountsQuery.isLoading ? (
              <AccountsTableSkeleton />
            ) : accounts.length === 0 ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <WalletCardsIcon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>No accounts yet</EmptyTitle>
                  <EmptyDescription>
                    Add your first bank account, cash wallet, or digital wallet
                    to start tracking everyday balances.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button onClick={() => setDialogState({ mode: "create" })}>
                    <PlusIcon data-icon="inline-start" />
                    Create account
                  </Button>
                </EmptyContent>
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <span className="sr-only">Reorder</span>
                    </TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead className="text-right">
                      Current balance
                    </TableHead>
                    <TableHead>Opened</TableHead>
                    <TableHead>Activity</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((account) => (
                    <TableRow
                      key={account.id}
                      data-dragging={
                        draggedAccountId === account.id || undefined
                      }
                      className="data-[dragging=true]:opacity-50"
                      onDragOver={(event) => {
                        if (draggedAccountId) event.preventDefault()
                      }}
                      onDrop={(event) => {
                        event.preventDefault()
                        if (!draggedAccountId) return
                        moveAccount(
                          draggedAccountId,
                          accounts.findIndex((item) => item.id === account.id),
                        )
                        setDraggedAccountId(null)
                      }}
                    >
                      <TableCell>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          draggable={!reorderAccountsMutation.isPending}
                          aria-label={`Drag ${account.name} to reorder. Use the up and down arrow keys to move it.`}
                          className="cursor-grab active:cursor-grabbing"
                          onDragStart={(event) => {
                            setDraggedAccountId(account.id)
                            event.dataTransfer.effectAllowed = "move"
                            event.dataTransfer.setData("text/plain", account.id)
                          }}
                          onDragEnd={() => setDraggedAccountId(null)}
                          onKeyDown={(event) => {
                            const currentIndex = accounts.findIndex(
                              (item) => item.id === account.id,
                            )
                            if (event.key === "ArrowUp") {
                              event.preventDefault()
                              moveAccount(account.id, currentIndex - 1)
                            } else if (event.key === "ArrowDown") {
                              event.preventDefault()
                              moveAccount(account.id, currentIndex + 1)
                            }
                          }}
                        >
                          <GripVerticalIcon />
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div className="flex min-w-0 flex-col gap-1">
                          <Link
                            className="truncate font-medium hover:underline"
                            href={`/accounts/${account.id}`}
                          >
                            {account.name}
                          </Link>
                          <span className="truncate text-xs text-muted-foreground">
                            Updated {formatDate(account.updatedAt)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {getAccountTypeLabel(account.type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono">
                        {account.currency}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatAmount(account.currentBalance, account.currency)}
                      </TableCell>
                      <TableCell>{formatDate(account.openedAt)}</TableCell>
                      <TableCell>
                        {account.transactionCount > 0 ? (
                          <Badge variant="secondary">
                            {account.transactionCount}{" "}
                            {account.transactionCount === 1
                              ? "transaction"
                              : "transactions"}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/accounts/${account.id}`}>
                              <EyeIcon data-icon="inline-start" />
                              View
                            </Link>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setAccountToAdjust(account)}
                          >
                            Adjust balance
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setDialogState({ account, mode: "edit" })
                            }
                          >
                            <PencilLineIcon data-icon="inline-start" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setAccountToDelete(account)}
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
            )}
          </CardContent>
        </Card>
      </main>

      {accountToAdjust ? (
        <AdjustBalanceDialog
          account={accountToAdjust}
          onClose={() => setAccountToAdjust(null)}
        />
      ) : null}

      <AccountFormDialog
        allowedAccountTypes={["BANK", "CASH_WALLET", "DIGITAL_WALLET"]}
        open={dialogState !== null}
        mode={dialogState?.mode ?? "create"}
        account={dialogState?.mode === "edit" ? dialogState.account : null}
        defaultCurrency={
          (settingsQuery.data?.baseCurrency === "PKR" ? "PKR" : "USD") as
            "USD" | "PKR"
        }
        isPending={saveAccountMutation.isPending}
        errorMessage={
          saveAccountMutation.isError ? saveAccountMutation.error.message : null
        }
        onOpenChange={(open) => {
          if (!open) {
            setDialogState(null)
            saveAccountMutation.reset()
          }
        }}
        onSubmit={handleSaveAccount}
      />

      <AlertDialog
        open={accountToDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAccountToDelete(null)
            deleteAccountMutation.reset()
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2Icon aria-hidden="true" />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete account</AlertDialogTitle>
            <AlertDialogDescription>
              {accountToDelete
                ? `Delete ${accountToDelete.name}? All transactions linked to this account will be permanently removed.`
                : "Delete this account?"}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {deleteAccountMutation.isError ? (
            <Alert variant="destructive">
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>Delete failed</AlertTitle>
              <AlertDescription>
                {deleteAccountMutation.error.message}
              </AlertDescription>
            </Alert>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteAccountMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteAccountMutation.isPending}
              onClick={async (event) => {
                event.preventDefault()
                await handleDeleteAccount()
              }}
            >
              {deleteAccountMutation.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Trash2Icon data-icon="inline-start" />
              )}
              Delete account
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
        <p className="font-mono text-2xl font-semibold tracking-normal">
          {value}
        </p>
      </CardContent>
    </Card>
  )
}

function AccountsTableSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1fr)] gap-3"
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
