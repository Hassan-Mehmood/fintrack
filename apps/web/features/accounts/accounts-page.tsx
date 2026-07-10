"use client"

import { useAuth } from "@clerk/nextjs"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import {
  CircleAlertIcon,
  PencilLineIcon,
  PlusIcon,
  ReceiptTextIcon,
  Trash2Icon,
  WalletCardsIcon,
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

import { AccountFormDialog } from "./account-form-dialog"
import { type AccountFormPayload } from "./account-form-schema"
import { dashboardQueryKey } from "@/features/dashboard/dashboard-api"
import { getSettings, settingsQueryKey } from "@/features/settings/settings-api"

import {
  accountsQueryKey,
  createAccount,
  deleteAccount,
  listAccounts,
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
  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null)

  const accountsQuery = useQuery({
    queryKey: accountsQueryKey,
    queryFn: () => listAccounts(getToken),
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

  const accounts = accountsQuery.data ?? []
  const totalAccounts = accounts.length
  const deletableAccounts = accounts.filter((account) => account.canDelete).length
  const currenciesCount = new Set(accounts.map((account) => account.currency)).size
  const accountsWithHistory = totalAccounts - deletableAccounts

  async function handleSaveAccount(payload: AccountFormPayload): Promise<void> {
    if (!dialogState) {
      return
    }

    await saveAccountMutation.mutateAsync({
      accountId: dialogState.mode === "edit" ? dialogState.account.id : undefined,
      mode: dialogState.mode,
      payload,
    })

    setDialogState(null)
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
    await invalidateAccountData()
  }

  return (
    <AppShell
      currentSection="accounts"
      title="Accounts"
      description="Create, update, and remove financial accounts from one place."
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

        <section className="grid gap-4 md:grid-cols-3">
          <SummaryCard
            label="Total accounts"
            value={accountsQuery.isLoading ? "..." : String(totalAccounts)}
            detail="All tracked asset accounts"
          />
          <SummaryCard
            label="Currencies"
            value={accountsQuery.isLoading ? "..." : String(currenciesCount)}
            detail="Distinct reporting currencies"
          />
          <SummaryCard
            label="Deletable"
            value={accountsQuery.isLoading ? "..." : String(deletableAccounts)}
            detail="Accounts without recorded activity"
          />
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Managed accounts</CardTitle>
            <CardDescription>
              Accounts with transaction history stay protected so financial records remain traceable.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {accountsWithHistory > 0 ? (
              <Alert>
                <ReceiptTextIcon aria-hidden="true" />
                <AlertTitle>Delete is limited by account history</AlertTitle>
                <AlertDescription>
                  {accountsWithHistory} {accountsWithHistory === 1 ? "account has" : "accounts have"} linked transactions and cannot be deleted.
                </AlertDescription>
              </Alert>
            ) : null}

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
                    Add your first bank, cash, digital, broker, or crypto account to start tracking balances.
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
                    <TableHead>Account</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead className="text-right">Opening balance</TableHead>
                    <TableHead>Opened</TableHead>
                    <TableHead>Activity</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell>
                        <div className="flex min-w-0 flex-col gap-1">
                          <span className="truncate font-medium">{account.name}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            Updated {formatDate(account.updatedAt)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{getAccountTypeLabel(account.type)}</Badge>
                      </TableCell>
                      <TableCell className="font-mono">{account.currency}</TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatAmount(account.openingBalance, account.currency)}
                      </TableCell>
                      <TableCell>{formatDate(account.openedAt)}</TableCell>
                      <TableCell>
                        {account.canDelete ? (
                          <Badge variant="secondary">No transactions</Badge>
                        ) : (
                          <Badge variant="secondary">
                            {account.transactionCount} {account.transactionCount === 1 ? "transaction" : "transactions"}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
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
                            disabled={!account.canDelete}
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

      <AccountFormDialog
        open={dialogState !== null}
        mode={dialogState?.mode ?? "create"}
        account={dialogState?.mode === "edit" ? dialogState.account : null}
        defaultCurrency={
          (settingsQuery.data?.baseCurrency === "PKR" ? "PKR" : "USD") as
            | "USD"
            | "PKR"
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
                ? `Delete ${accountToDelete.name}? This only works while the account has no recorded transactions.`
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
        <p className="font-mono text-2xl font-semibold tracking-normal">{value}</p>
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
          className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1fr)] gap-3"
        >
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

