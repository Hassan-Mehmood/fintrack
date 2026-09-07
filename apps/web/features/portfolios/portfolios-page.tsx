"use client"

import { useAuth } from "@clerk/nextjs"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import {
  CircleAlertIcon,
  FolderIcon,
  PencilLineIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"

import { accountsQueryKey, listAccounts } from "@/features/accounts/accounts-api"
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

import { formatAmount, formatSignedAmount } from "@/lib/formatting"
import { cn } from "@/lib/utils"

import { PortfolioFormDialog } from "./portfolio-form-dialog"
import {
  createPortfolio,
  deletePortfolio,
  listPortfolios,
  portfoliosQueryKey,
  updatePortfolio,
} from "./portfolios-api"
import type { Portfolio, PortfolioPayload } from "./portfolio-types"

type PortfolioDialogState =
  | { readonly mode: "create" }
  | { readonly mode: "edit"; readonly portfolio: Portfolio }
  | null

export function PortfoliosPage() {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  const [dialogState, setDialogState] = useState<PortfolioDialogState>(null)
  const [portfolioToDelete, setPortfolioToDelete] = useState<Portfolio | null>(
    null
  )

  const portfoliosQuery = useQuery({
    queryKey: portfoliosQueryKey,
    queryFn: () => listPortfolios(getToken),
  })

  const accountsQuery = useQuery({
    queryKey: accountsQueryKey,
    queryFn: () => listAccounts(getToken),
  })

  const createPortfolioMutation = useMutation({
    mutationFn: (payload: PortfolioPayload) =>
      createPortfolio(getToken, payload),
  })

  const updatePortfolioMutation = useMutation({
    mutationFn: ({
      portfolioId,
      payload,
    }: {
      readonly portfolioId: string
      readonly payload: PortfolioPayload
    }) => updatePortfolio(getToken, portfolioId, payload),
  })

  const deletePortfolioMutation = useMutation({
    mutationFn: (portfolioId: string) => deletePortfolio(getToken, portfolioId),
  })

  const portfolios = portfoliosQuery.data ?? []
  const accounts = accountsQuery.data ?? []

  const hasError = portfoliosQuery.isError || accountsQuery.isError
  const isLoading = portfoliosQuery.isLoading || accountsQuery.isLoading

  async function handleSavePortfolio(
    payload: PortfolioPayload
  ): Promise<void> {
    if (!dialogState) {
      return
    }

    if (dialogState.mode === "create") {
      await createPortfolioMutation.mutateAsync(payload)
    } else {
      await updatePortfolioMutation.mutateAsync({
        portfolioId: dialogState.portfolio.id,
        payload,
      })
    }

    setDialogState(null)
    await queryClient.invalidateQueries({ queryKey: portfoliosQueryKey })
  }

  function handleEditClick(portfolio: Portfolio): void {
    setDialogState({ mode: "edit", portfolio })
  }

  async function handleDeletePortfolio(): Promise<void> {
    if (!portfolioToDelete) {
      return
    }

    await deletePortfolioMutation.mutateAsync(portfolioToDelete.id)
    setPortfolioToDelete(null)
    await queryClient.invalidateQueries({ queryKey: portfoliosQueryKey })
  }

  return (
    <AppShell
      currentSection="portfolios"
      title="Portfolios"
      description="Group accounts into custom portfolios and track combined performance."
      primaryAction={
        <Button
          size="sm"
          onClick={() => setDialogState({ mode: "create" })}
          disabled={accounts.length === 0}
        >
          <PlusIcon data-icon="inline-start" />
          Create portfolio
        </Button>
      }
    >
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
        {hasError ? (
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden="true" />
            <AlertTitle>Unable to load portfolios</AlertTitle>
            <AlertDescription>
              {portfoliosQuery.error?.message ?? accountsQuery.error?.message}
            </AlertDescription>
          </Alert>
        ) : null}

        {isLoading ? (
          <PortfoliosSkeleton />
        ) : portfolios.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No portfolios yet</EmptyTitle>
              <EmptyDescription>
                Create your first portfolio to group accounts and see combined
                value, cost basis, and allocation.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                onClick={() => setDialogState({ mode: "create" })}
                disabled={accounts.length === 0}
              >
                <PlusIcon data-icon="inline-start" />
                Create portfolio
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="grid gap-4">
            {portfolios.map((portfolio) => (
              <PortfolioCard
                key={portfolio.id}
                portfolio={portfolio}
                onEdit={() => handleEditClick(portfolio)}
                onDelete={() => setPortfolioToDelete(portfolio)}
              />
            ))}
          </div>
        )}
      </main>

      <PortfolioFormDialog
        open={dialogState !== null}
        mode={dialogState?.mode ?? "create"}
        portfolio={
          dialogState?.mode === "edit" ? dialogState.portfolio : null
        }
        accounts={accounts}
        isPending={
          createPortfolioMutation.isPending || updatePortfolioMutation.isPending
        }
        errorMessage={
          createPortfolioMutation.isError
            ? createPortfolioMutation.error.message
            : updatePortfolioMutation.isError
              ? updatePortfolioMutation.error.message
              : null
        }
        onOpenChange={(open) => {
          if (!open) {
            setDialogState(null)
            createPortfolioMutation.reset()
            updatePortfolioMutation.reset()
          }
        }}
        onSubmit={handleSavePortfolio}
      />

      <AlertDialog
        open={portfolioToDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPortfolioToDelete(null)
            deletePortfolioMutation.reset()
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2Icon aria-hidden="true" />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete portfolio</AlertDialogTitle>
            <AlertDialogDescription>
              {portfolioToDelete
                ? `Delete "${portfolioToDelete.name}"? The accounts in this portfolio will not be deleted.`
                : "Delete this portfolio?"}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {deletePortfolioMutation.isError ? (
            <Alert variant="destructive">
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>Delete failed</AlertTitle>
              <AlertDescription>
                {deletePortfolioMutation.error.message}
              </AlertDescription>
            </Alert>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePortfolioMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deletePortfolioMutation.isPending}
              onClick={async (event) => {
                event.preventDefault()
                await handleDeletePortfolio()
              }}
            >
              {deletePortfolioMutation.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Trash2Icon data-icon="inline-start" />
              )}
              Delete portfolio
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  )
}

interface PortfolioCardProps {
  readonly portfolio: Portfolio
  readonly onEdit: () => void
  readonly onDelete: () => void
}

function PortfolioCard({ portfolio, onEdit, onDelete }: PortfolioCardProps) {
  const baseCurrency = portfolio.metrics.baseCurrency

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle>{portfolio.name}</CardTitle>
              {portfolio.metrics.isPartial ? (
                <Badge variant="outline">Partial prices</Badge>
              ) : null}
            </div>
            {portfolio.description ? (
              <CardDescription>{portfolio.description}</CardDescription>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="outline" onClick={onEdit}>
              <PencilLineIcon data-icon="inline-start" />
              Edit
            </Button>
            <Button size="sm" variant="destructive" onClick={onDelete}>
              <Trash2Icon data-icon="inline-start" />
              Delete
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <SummaryCard
            label="Total value"
            value={formatAmount(portfolio.metrics.totalValue, baseCurrency)}
            detail={
              portfolio.metrics.isPartial
                ? `Known subtotal · ${portfolio.metrics.unpricedAssetCount} unpriced · ${portfolio.metrics.unknownCostBasisCount} unknown cost`
                : "Cash + holdings"
            }
          />
          <SummaryCard
            label="Cost basis"
            value={portfolio.metrics.totalCostBasis ? formatAmount(portfolio.metrics.totalCostBasis, baseCurrency) : "Unavailable"}
            detail="Amount invested"
          />
          <SummaryCard
            label="Unrealized gain"
            value={portfolio.metrics.totalUnrealizedGain ? formatSignedAmount(
              portfolio.metrics.totalUnrealizedGain,
              baseCurrency
            ) : "Unavailable"}
            detail="Open P&L"
            tone={getTone(portfolio.metrics.totalUnrealizedGain)}
          />
          <SummaryCard
            label="Realized gain"
            value={portfolio.metrics.totalRealizedGain ? formatSignedAmount(
              portfolio.metrics.totalRealizedGain,
              baseCurrency
            ) : "Unavailable"}
            detail="Closed P&L"
            tone={getTone(portfolio.metrics.totalRealizedGain)}
          />
          <SummaryCard
            label="Risk score"
            value={
              portfolio.metrics.weightedRiskScore !== null
                ? String(portfolio.metrics.weightedRiskScore)
                : "—"
            }
            detail="Value-weighted"
          />
        </section>

        {portfolio.accounts.length > 0 ? (
          <section>
            <h3 className="mb-2 text-sm font-semibold">Accounts</h3>
            <div className="flex flex-wrap gap-2">
              {portfolio.accounts.map((account) => (
                <Badge key={account.id} variant="secondary">
                  {account.name}
                </Badge>
              ))}
            </div>
          </section>
        ) : null}

        {portfolio.allocation.length > 0 ? (
          <section>
            <h3 className="mb-2 text-sm font-semibold">Asset allocation</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {portfolio.allocation.map((item) => (
                <div
                  key={item.category}
                  className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm"
                >
                  <span className="truncate">{item.category}</span>
                  <span className="font-mono">{item.value}%</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </CardContent>
    </Card>
  )
}

function SummaryCard({
  detail,
  label,
  tone = "neutral",
  value,
}: {
  readonly detail: string
  readonly label: string
  readonly tone?: "positive" | "negative" | "neutral"
  readonly value: string
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "font-mono text-xl font-semibold tracking-normal",
          tone === "positive" && "text-[var(--state-success)]",
          tone === "negative" && "text-[var(--state-error)]"
        )}
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function getTone(amount: string | null): "positive" | "negative" | "neutral" {
  const value = Number(amount)

  if (value > 0) {
    return "positive"
  }

  if (value < 0) {
    return "negative"
  }

  return "neutral"
}

function PortfoliosSkeleton() {
  return (
    <div className="grid gap-4">
      {Array.from({ length: 2 }).map((_, index) => (
        <Card key={index}>
          <CardHeader>
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-4 w-1/2" />
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-4 md:grid-cols-5">
              {Array.from({ length: 5 }).map((__, metricIndex) => (
                <Skeleton key={metricIndex} className="h-16 rounded-lg" />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
