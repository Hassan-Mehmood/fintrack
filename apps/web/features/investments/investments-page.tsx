"use client"

import { useAuth } from "@clerk/nextjs"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  CircleAlertIcon,
  PiggyBankIcon,
  RefreshCwIcon,
} from "lucide-react"
import Link from "next/link"
import { useMemo, useState, type ReactNode } from "react"

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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { formatAmount, formatDateTime, formatSignedAmount } from "@/lib/formatting"
import { cn } from "@/lib/utils"

import { HoldingsTable } from "./holdings-table"
import {
  getInvestmentSummary,
  holdingsQueryKey,
  investmentSummaryQueryKey,
  listHoldings,
} from "./investments-api"
import type {
  CurrencyTotal,
  Holding,
  HoldingGroupBy,
  InvestmentFilters,
  ReportingCurrency,
} from "./investment-types"

const ALL = "ALL"
const EMPTY_HOLDINGS: readonly Holding[] = []

export function InvestmentsPage() {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  const [reportingCurrency, setReportingCurrency] =
    useState<ReportingCurrency>("USD")
  const [groupBy, setGroupBy] = useState<HoldingGroupBy>("NONE")
  const [accountId, setAccountId] = useState(ALL)
  const [portfolioId, setPortfolioId] = useState(ALL)
  const [assetType, setAssetType] = useState(ALL)
  const [currency, setCurrency] = useState(ALL)
  const [showExposure, setShowExposure] = useState(false)

  const filters: InvestmentFilters = {
    accountId: accountId === ALL ? undefined : accountId,
    portfolioId: portfolioId === ALL ? undefined : portfolioId,
    assetType: assetType === ALL ? undefined : assetType,
    currency: currency === ALL ? undefined : currency,
  }
  const holdingsQuery = useQuery({
    queryKey: [...holdingsQueryKey, reportingCurrency],
    queryFn: () => listHoldings(getToken, reportingCurrency),
  })
  const summaryQuery = useQuery({
    queryKey: [
      ...investmentSummaryQueryKey,
      reportingCurrency,
      accountId,
      portfolioId,
      assetType,
      currency,
    ],
    queryFn: () =>
      getInvestmentSummary(getToken, reportingCurrency, filters),
  })
  const holdings = holdingsQuery.data ?? EMPTY_HOLDINGS
  const filteredHoldings = filterHoldings(holdings, filters)
  const summary = summaryQuery.data
  const options = useMemo(() => buildFilterOptions(holdings), [holdings])
  const hasError = holdingsQuery.isError || summaryQuery.isError
  const isLoading = holdingsQuery.isLoading || summaryQuery.isLoading

  return (
    <AppShell
      currentSection="investments"
      title="Investments"
      description="Track holdings in USD, PKR, or their original currencies without losing native price context."
      primaryAction={
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={holdingsQuery.isFetching || summaryQuery.isFetching}
            onClick={() =>
              queryClient.invalidateQueries({ queryKey: ["investments"] })
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

        <ReportControls
          accountId={accountId}
          assetType={assetType}
          currency={currency}
          groupBy={groupBy}
          options={options}
          portfolioId={portfolioId}
          reportingCurrency={reportingCurrency}
          onAccountChange={setAccountId}
          onAssetTypeChange={setAssetType}
          onCurrencyChange={setCurrency}
          onGroupByChange={setGroupBy}
          onPortfolioChange={setPortfolioId}
          onReportingCurrencyChange={setReportingCurrency}
        />

        {summary?.isPartial ? (
          <Alert>
            <CircleAlertIcon aria-hidden="true" />
            <AlertTitle>Portfolio report is partial</AlertTitle>
            <AlertDescription>
              {summary.unpricedAssetCount > 0
                ? `${summary.unpricedAssetCount} holding price${summary.unpricedAssetCount === 1 ? " is" : "s are"} unavailable. `
                : ""}
              {summary.missingHistoricalFxCount > 0
                ? `${summary.missingHistoricalFxCount} holding${summary.missingHistoricalFxCount === 1 ? " is" : "s are"} missing a historical FX snapshot.`
                : ""}
            </AlertDescription>
          </Alert>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            label="Total value"
            value={
              isLoading ? (
                "..."
              ) : (
                <SummaryValue
                  currency={reportingCurrency}
                  field="totalCurrentValue"
                  summary={summary}
                />
              )
            }
            detail={
              reportingCurrency === "NATIVE"
                ? "Current value by currency"
                : `Current market value in ${reportingCurrency}`
            }
          />
          <SummaryCard
            label="Cost basis"
            value={
              isLoading ? (
                "..."
              ) : (
                <SummaryValue
                  currency={reportingCurrency}
                  field="totalCostBasis"
                  summary={summary}
                />
              )
            }
            detail="Historical transaction FX rates"
          />
          <SummaryCard
            label="Unrealized gain"
            value={
              isLoading ? (
                "..."
              ) : (
                <SummaryValue
                  currency={reportingCurrency}
                  field="totalUnrealizedGain"
                  signed
                  summary={summary}
                />
              )
            }
            detail="Open position P&L"
            tone={
              reportingCurrency === "NATIVE"
                ? "neutral"
                : getTone(summary?.totalUnrealizedGain ?? undefined)
            }
          />
          <SummaryCard
            label="Realized gain"
            value={
              isLoading ? (
                "..."
              ) : (
                <SummaryValue
                  currency={reportingCurrency}
                  field="totalRealizedGain"
                  signed
                  summary={summary}
                />
              )
            }
            detail="Closed position P&L"
            tone={
              reportingCurrency === "NATIVE"
                ? "neutral"
                : getTone(summary?.totalRealizedGain ?? undefined)
            }
          />
        </section>

        {summary ? (
          <Card>
            <CardHeader>
              <CardTitle>Exchange rate</CardTitle>
              <CardDescription>
                Current market values use this latest rate. Historical cost
                basis and realized gains use the snapshot stored on each
                transaction.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-mono text-sm">
                1 {summary.exchangeRate.baseCurrency} ={" "}
                {summary.exchangeRate.rate ?? "Not configured"}{" "}
                {summary.exchangeRate.quoteCurrency}
              </p>
              <p className="text-sm text-muted-foreground">
                {formatSource(summary.exchangeRate.source)}
                {summary.exchangeRate.updatedAt
                  ? ` · Updated ${formatDateTime(summary.exchangeRate.updatedAt)}`
                  : " · No update timestamp"}
              </p>
            </CardContent>
          </Card>
        ) : null}

        {summary && summary.currencyExposure.length > 0 ? (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <CardTitle>Currency exposure</CardTitle>
                  <CardDescription>
                    Current holding value grouped by native asset currency.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowExposure((current) => !current)}
                >
                  {showExposure ? "Hide breakdown" : "Show breakdown"}
                </Button>
              </div>
            </CardHeader>
            {showExposure ? (
              <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {summary.currencyExposure.map((exposure) => (
                  <div
                    key={exposure.currency}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <span className="font-medium">{exposure.currency}</span>
                    <div className="text-right">
                      <p className="font-mono">
                        {formatAmount(
                          exposure.currentValue,
                          reportingCurrency === "NATIVE"
                            ? exposure.currency
                            : reportingCurrency
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {exposure.sharePercent?.toFixed(2) ?? "—"}%
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            ) : null}
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Holdings</CardTitle>
            <CardDescription>
              Reporting values are primary; original asset-price values remain
              visible beneath them when conversion is applied.
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
              <HoldingsTable
                groupBy={groupBy}
                holdings={filteredHoldings}
                reportingCurrency={reportingCurrency}
              />
            )}
          </CardContent>
        </Card>
      </main>
    </AppShell>
  )
}

function ReportControls({
  accountId,
  assetType,
  currency,
  groupBy,
  onAccountChange,
  onAssetTypeChange,
  onCurrencyChange,
  onGroupByChange,
  onPortfolioChange,
  onReportingCurrencyChange,
  options,
  portfolioId,
  reportingCurrency,
}: {
  readonly accountId: string
  readonly assetType: string
  readonly currency: string
  readonly groupBy: HoldingGroupBy
  readonly onAccountChange: (value: string) => void
  readonly onAssetTypeChange: (value: string) => void
  readonly onCurrencyChange: (value: string) => void
  readonly onGroupByChange: (value: HoldingGroupBy) => void
  readonly onPortfolioChange: (value: string) => void
  readonly onReportingCurrencyChange: (value: ReportingCurrency) => void
  readonly options: ReturnType<typeof buildFilterOptions>
  readonly portfolioId: string
  readonly reportingCurrency: ReportingCurrency
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reporting and grouping</CardTitle>
        <CardDescription>
          Choose a reporting currency, narrow the holdings, or group the table.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <FilterSelect
          label="Reporting currency"
          value={reportingCurrency}
          options={[
            ["USD", "USD"],
            ["PKR", "PKR"],
            ["NATIVE", "Native currencies"],
          ]}
          onChange={(value) =>
            onReportingCurrencyChange(value as ReportingCurrency)
          }
        />
        <FilterSelect
          label="Account"
          value={accountId}
          options={[
            [ALL, "All accounts"],
            ...options.accounts.map(({ id, label }) => [id, label] as const),
          ]}
          onChange={onAccountChange}
        />
        <FilterSelect
          label="Portfolio"
          value={portfolioId}
          options={[
            [ALL, "All portfolios"],
            ...options.portfolios.map(({ id, label }) => [id, label] as const),
          ]}
          onChange={onPortfolioChange}
        />
        <FilterSelect
          label="Asset type"
          value={assetType}
          options={[
            [ALL, "All asset types"],
            ...options.assetTypes.map((value) => [value, value] as const),
          ]}
          onChange={onAssetTypeChange}
        />
        <FilterSelect
          label="Currency"
          value={currency}
          options={[
            [ALL, "All currencies"],
            ...options.currencies.map((value) => [value, value] as const),
          ]}
          onChange={onCurrencyChange}
        />
        <FilterSelect
          label="Group by"
          value={groupBy}
          options={[
            ["NONE", "No grouping"],
            ["ACCOUNT", "Account"],
            ["PORTFOLIO", "Portfolio"],
            ["ASSET_TYPE", "Asset type"],
            ["CURRENCY", "Currency"],
          ]}
          onChange={(value) => onGroupByChange(value as HoldingGroupBy)}
        />
      </CardContent>
    </Card>
  )
}

function FilterSelect({
  label,
  onChange,
  options,
  value,
}: {
  readonly label: string
  readonly onChange: (value: string) => void
  readonly options: ReadonlyArray<readonly [string, string]>
  readonly value: string
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map(([optionValue, optionLabel]) => (
              <SelectItem key={optionValue} value={optionValue}>
                {optionLabel}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}

function SummaryValue({
  currency,
  field,
  signed = false,
  summary,
}: {
  readonly currency: ReportingCurrency
  readonly field:
    | "totalCostBasis"
    | "totalCurrentValue"
    | "totalRealizedGain"
    | "totalUnrealizedGain"
  readonly signed?: boolean
  readonly summary:
    | {
        readonly totalCostBasis: string | null
        readonly totalCurrentValue: string | null
        readonly totalRealizedGain: string | null
        readonly totalUnrealizedGain: string | null
        readonly totalsByCurrency: readonly CurrencyTotal[]
      }
    | undefined
}) {
  if (!summary) {
    return "—"
  }

  if (currency !== "NATIVE") {
    const value = summary[field]
    return value
      ? signed
        ? formatSignedAmount(value, currency)
        : formatAmount(value, currency)
      : "Unavailable"
  }

  if (summary.totalsByCurrency.length === 0) {
    return "—"
  }

  return (
    <span className="flex flex-col gap-1">
      {summary.totalsByCurrency.map((total) => (
        <span key={total.currency}>
          {signed
            ? formatSignedAmount(total[field], total.currency)
            : formatAmount(total[field], total.currency)}
        </span>
      ))}
    </span>
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
  readonly value: ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <CardDescription>{detail}</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            "font-mono text-2xl font-semibold tracking-normal",
            tone === "positive" && "text-[var(--state-success)]",
            tone === "negative" && "text-[var(--state-error)]"
          )}
        >
          {value}
        </div>
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
          className="grid grid-cols-[minmax(0,1.6fr)_repeat(9,minmax(0,1fr))] gap-3"
        >
          {Array.from({ length: 10 }).map((__, cellIndex) => (
            <Skeleton key={cellIndex} className="h-10 rounded-lg" />
          ))}
        </div>
      ))}
    </div>
  )
}

function filterHoldings(
  holdings: readonly Holding[],
  filters: InvestmentFilters
): readonly Holding[] {
  return holdings.filter(
    (holding) =>
      (!filters.accountId || holding.accountId === filters.accountId) &&
      (!filters.portfolioId ||
        holding.portfolios.some(
          ({ id }) => id === filters.portfolioId
        )) &&
      (!filters.assetType || holding.categoryName === filters.assetType) &&
      (!filters.currency || holding.nativeCurrency === filters.currency)
  )
}

function buildFilterOptions(holdings: readonly Holding[]) {
  const accounts = new Map<string, string>()
  const portfolios = new Map<string, string>()
  const assetTypes = new Set<string>()
  const currencies = new Set<string>()

  for (const holding of holdings) {
    accounts.set(
      holding.accountId,
      `${holding.accountName} · ${holding.accountCurrency}`
    )
    holding.portfolios.forEach(({ id, name }) => portfolios.set(id, name))
    assetTypes.add(holding.categoryName)
    currencies.add(holding.nativeCurrency)
  }

  return {
    accounts: [...accounts.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((left, right) => left.label.localeCompare(right.label)),
    portfolios: [...portfolios.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((left, right) => left.label.localeCompare(right.label)),
    assetTypes: [...assetTypes].sort(),
    currencies: [...currencies].sort(),
  }
}

function formatSource(source: string): string {
  return source
    .toLocaleLowerCase()
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ")
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
