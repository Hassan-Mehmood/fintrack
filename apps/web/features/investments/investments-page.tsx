"use client"

import { useAuth } from "@clerk/nextjs"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  CircleAlertIcon,
  PiggyBankIcon,
  RefreshCwIcon,
} from "lucide-react"

import { AppShell } from "@/components/app-shell"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import { cn } from "@/lib/utils"
import { formatAmount } from "@/lib/formatting"
import Link from "next/link"

import {
  getInvestmentSummary,
  holdingsQueryKey,
  investmentSummaryQueryKey,
  listHoldings,
} from "./investments-api"
import { HoldingsTable } from "./holdings-table"

export function InvestmentsPage() {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()

  const holdingsQuery = useQuery({
    queryKey: holdingsQueryKey,
    queryFn: () => listHoldings(getToken),
  })

  const summaryQuery = useQuery({
    queryKey: investmentSummaryQueryKey,
    queryFn: () => getInvestmentSummary(getToken),
  })

  const holdings = holdingsQuery.data ?? []
  const summary = summaryQuery.data
  const baseCurrency = summary?.baseCurrency ?? holdingsQuery.data?.[0]?.priceCurrency ?? "USD"

  const hasError = holdingsQuery.isError || summaryQuery.isError
  const isLoading = holdingsQuery.isLoading || summaryQuery.isLoading

  return (
    <AppShell
      currentSection="investments"
      title="Investments"
      description="Track your portfolio holdings, cost basis, and unrealized or realized gains."
      primaryAction={
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={holdingsQuery.isFetching || summaryQuery.isFetching}
            onClick={() =>
              Promise.all([
                queryClient.invalidateQueries({ queryKey: holdingsQueryKey }),
                queryClient.invalidateQueries({
                  queryKey: investmentSummaryQueryKey,
                }),
              ])
            }
          >
            {holdingsQuery.isFetching || summaryQuery.isFetching ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RefreshCwIcon data-icon="inline-start" />
            )}
            Refresh prices
          </Button>
          <Button size="sm" asChild>
            <Link href="/transactions">Add transaction</Link>
          </Button>
        </div>
      }
    >
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
        {hasError ? (
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden="true" />
            <AlertTitle>Unable to load investments</AlertTitle>
            <AlertDescription>
              {holdingsQuery.error?.message ?? summaryQuery.error?.message}
            </AlertDescription>
          </Alert>
        ) : null}

        {summary?.isPartial ? (
          <Alert>
            <CircleAlertIcon aria-hidden="true" />
            <AlertTitle>Portfolio total is partial</AlertTitle>
            <AlertDescription>
              {summary.unpricedAssetCount} held asset
              {summary.unpricedAssetCount === 1 ? "" : "s"} could not be priced.
              Totals include only assets with an available or stale quote.
            </AlertDescription>
          </Alert>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            label="Total value"
            value={
              isLoading
                ? "..."
                : formatAmount(summary?.totalCurrentValue ?? "0", baseCurrency)
            }
            detail="Current market value"
          />
          <SummaryCard
            label="Cost basis"
            value={
              isLoading
                ? "..."
                : formatAmount(summary?.totalCostBasis ?? "0", baseCurrency)
            }
            detail="Total amount invested"
          />
          <SummaryCard
            label="Unrealized gain"
            value={
              isLoading
                ? "..."
                : formatSignedAmount(
                    summary?.totalUnrealizedGain ?? "0",
                    baseCurrency
                  )
            }
            detail="Open position P&L"
            tone={getTone(summary?.totalUnrealizedGain)}
          />
          <SummaryCard
            label="Realized gain"
            value={
              isLoading
                ? "..."
                : formatSignedAmount(
                    summary?.totalRealizedGain ?? "0",
                    baseCurrency
                  )
            }
            detail="Closed position P&L"
            tone={getTone(summary?.totalRealizedGain)}
          />
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Holdings</CardTitle>
            <CardDescription>
              Derived from your investment transactions and the latest cached
              provider or manual prices.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <HoldingsTableSkeleton />
            ) : holdings.length === 0 ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <PiggyBankIcon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>No holdings yet</EmptyTitle>
                  <EmptyDescription>
                    Record an investment buy transaction to start tracking your
                    portfolio performance.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button asChild>
                    <Link href="/transactions">Add transaction</Link>
                  </Button>
                </EmptyContent>
              </Empty>
            ) : (
              <HoldingsTable holdings={holdings} baseCurrency={baseCurrency} />
            )}
          </CardContent>
        </Card>
      </main>
    </AppShell>
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
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <CardDescription>{detail}</CardDescription>
      </CardHeader>
      <CardContent>
        <p
          className={cn(
            "font-mono text-2xl font-semibold tracking-normal",
            tone === "positive" && "text-[var(--state-success)]",
            tone === "negative" && "text-[var(--state-error)]"
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  )
}

function HoldingsTableSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3"
        >
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
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

function formatSignedAmount(amount: string, currency: string): string {
  const value = Number(amount)
  const sign = value < 0 ? "-" : "+"
  const absolute = formatAmount(Math.abs(value).toString(), currency)

  return `${sign} ${absolute}`
}

function getTone(amount: string | undefined): "positive" | "negative" | "neutral" {
  if (amount === undefined) {
    return "neutral"
  }

  const value = Number(amount)

  if (value > 0) {
    return "positive"
  }

  if (value < 0) {
    return "negative"
  }

  return "neutral"
}
