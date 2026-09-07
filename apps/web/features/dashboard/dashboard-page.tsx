"use client"

import { useAuth } from "@clerk/nextjs"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  BanknoteIcon,
  BitcoinIcon,
  BriefcaseBusinessIcon,
  CircleAlertIcon,
  CircleDollarSignIcon,
  ClockIcon,
  CreditCardIcon,
  GaugeIcon,
  LandmarkIcon,
  PiggyBankIcon,
  PlusIcon,
  ReceiptTextIcon,
  TargetIcon,
  WalletCardsIcon,
} from "lucide-react"


import Link from "next/link"

import { AppShell } from "@/components/app-shell"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatAmount, formatDate, formatSignedAmount } from "@/lib/formatting"
import { cn } from "@/lib/utils"

import { dashboardQueryKey, getDashboard } from "./dashboard-api"
import { AssetAllocationChart, IncomeExpenseInvestmentChart } from "./dashboard-charts"
import type {
  DashboardAccountItem,
  DashboardAccountType,
  DashboardMetrics,
  RecentActivityItem,
} from "./dashboard-types"

const accountTypeIcons: Record<DashboardAccountType, typeof LandmarkIcon> = {
  BANK: LandmarkIcon,
  CASH_WALLET: WalletCardsIcon,
  DIGITAL_WALLET: CreditCardIcon,
  BROKER: BriefcaseBusinessIcon,
  CRYPTO_WALLET: BitcoinIcon,
}

const metricCards = [
  {
    key: "totalNetWorth" as const,
    label: "Total net worth",
    icon: CircleDollarSignIcon,
  },
  {
    key: "liquidCash" as const,
    label: "Everyday money",
    icon: BanknoteIcon,
  },
]

const comingSoonSections = [
  {
    section: "Expense breakdown",
    reason: "Categories are not available yet.",
    icon: ReceiptTextIcon,
  },
  {
    section: "Goal progress",
    reason: "Financial goals are not available yet.",
    icon: TargetIcon,
  },
  {
    section: "Budget progress",
    reason: "Monthly budgets are not available yet.",
    icon: GaugeIcon,
  },
]

export function DashboardPage() {
  const { getToken } = useAuth()
  const dashboardQuery = useQuery({
    queryKey: dashboardQueryKey,
    queryFn: () => getDashboard(getToken),
    staleTime: 0,
  })

  const data = dashboardQuery.data
  const isLoading = dashboardQuery.isLoading

  return (
    <AppShell
      currentSection="dashboard"
      title="Dashboard"
      description={`Overview for ${new Date().toLocaleDateString("en", { month: "long", year: "numeric" })}`}
      primaryAction={
        <Button size="sm">
          <PlusIcon data-icon="inline-start" />
          Record
        </Button>
      }
    >
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
        {dashboardQuery.isError ? (
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden="true" />
            <AlertTitle>Unable to load dashboard</AlertTitle>
            <AlertDescription>{dashboardQuery.error.message}</AlertDescription>
          </Alert>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2">
          {metricCards.map((metric) => (
            <MetricCard
              key={metric.key}
              label={metric.label}
              icon={metric.icon}
              value={
                isLoading || !data
                  ? undefined
                  : data.metrics[metric.key]
              }
              currency={data?.baseCurrency}
              detail={
                data ? getMetricDetail(metric.key, data) : undefined
              }
            />
          ))}
        </section>

        {isLoading || !data ? null : (
          <section className="grid gap-4 md:grid-cols-2">
            <InvestmentMetricCard
              label="Stocks"
              value={data.stocksSummary.totalAccountValue ?? "0"}
              currency={data.baseCurrency}
              detail={data.stocksSummary.totalUnrealizedGain
                ? `${formatSignedAmount(data.stocksSummary.totalUnrealizedGain, data.baseCurrency)} unrealized`
                : "Unrealized gain unavailable"}
              href="/stocks"
            />
            <InvestmentMetricCard
              label="Crypto"
              value={data.cryptoSummary.totalAccountValue ?? "0"}
              currency={data.baseCurrency}
              detail={data.cryptoSummary.totalUnrealizedGain
                ? `${formatSignedAmount(data.cryptoSummary.totalUnrealizedGain, data.baseCurrency)} unrealized`
                : "Unrealized gain unavailable"}
              href="/crypto"
            />
          </section>
        )}

        {isLoading || !data ? (
          <DashboardSkeleton />
        ) : data.accounts.length === 0 ? (
          <EmptyAccountsState />
        ) : (
          <>
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(360px,0.9fr)]">
              <Card>
                <CardHeader>
                  <CardTitle>Income vs expenses</CardTitle>
                  <CardDescription>
                    Monthly movement across everyday accounts.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <IncomeExpenseInvestmentChart data={data.monthlySummary} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Asset allocation</CardTitle>
                  <CardDescription>
                    Current asset mix by account category.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <AssetAllocationChart data={data.assetAllocation} />
                  <div className="grid gap-2">
                    {data.assetAllocation.map((item) => (
                      <div
                        key={item.name}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="size-2.5 rounded-full"
                            style={{
                              backgroundColor: `var(--color-${item.name})`,
                            }}
                            aria-hidden="true"
                          />
                          <span className="truncate">{item.label}</span>
                        </div>
                        <span className="font-mono text-sm">{item.value}%</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </section>

            <section>
              <Card>
                <CardHeader>
                  <CardTitle>Recent activity</CardTitle>
                  <CardDescription>
                    Latest everyday account movements.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {data.recentActivity.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No recent activity. Record a transaction to see it here.
                    </p>
                  ) : (
                    data.recentActivity.map((activity) => (
                      <ActivityRow key={activity.id} activity={activity} />
                    ))
                  )}
                </CardContent>
              </Card>
            </section>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
              <Card>
                <CardHeader>
                  <CardTitle>Connected wallets</CardTitle>
                  <CardDescription>
                    Balances across bank, cash, and digital-wallet accounts.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Account</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        <TableHead className="text-right">Share</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.accounts.map((account) => (
                        <AccountRow key={account.id} account={account} />
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <div className="grid gap-4">
                <ComingSoonCard
                  title="Expense breakdown"
                  description="Spending by category for the current month."
                  icon={ReceiptTextIcon}
                />
              </div>
            </section>

            <section>
              <h2 className="mb-4 text-lg font-semibold">Coming soon</h2>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {comingSoonSections.map((item) => (
                  <ComingSoonCard
                    key={item.section}
                    title={item.section}
                    description={item.reason}
                    icon={item.icon}
                  />
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </AppShell>
  )
}

function getMetricDetail(
  key: (typeof metricCards)[number]["key"],
  data: { readonly baseCurrency: string; readonly metrics: DashboardMetrics }
): string {
  const { metrics } = data

  switch (key) {
    case "totalNetWorth":
      return metrics.totalNetWorthChangePercent !== null
        ? `${metrics.totalNetWorthChangePercent >= 0 ? "+" : ""}${metrics.totalNetWorthChangePercent}% from last month`
        : "Asset-only total"
    case "liquidCash":
      return `${metrics.liquidCashPercent}% of total assets`
  }
}

interface MetricCardProps {
  readonly label: string
  readonly value?: string
  readonly currency?: string
  readonly detail?: string
  readonly icon: typeof CircleDollarSignIcon
}

function MetricCard({ label, value, currency, detail, icon: Icon }: MetricCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <CardAction>
          <div className="flex size-9 items-center justify-center rounded-md bg-muted">
            <Icon className="size-4" aria-hidden="true" />
          </div>
        </CardAction>
        <CardDescription>{detail ?? "Loading..."}</CardDescription>
      </CardHeader>
      <CardContent>
        {value !== undefined && currency !== undefined ? (
          <p className="font-mono text-2xl font-semibold tracking-normal">
            {formatAmount(value, currency)}
          </p>
        ) : (
          <Skeleton className="h-8 w-3/4" />
        )}
      </CardContent>
    </Card>
  )
}

interface InvestmentMetricCardProps {
  readonly href: string
  readonly label: string
  readonly value: string
  readonly currency: string
  readonly detail: string
  readonly tone?: "success" | "error" | "neutral"
}

function InvestmentMetricCard({
  label,
  value,
  currency,
  detail,
  href,
  tone = "neutral",
}: InvestmentMetricCardProps) {
  const isGainCard = label === "Unrealized gain" || label === "Realized gain"

  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <CardAction>
          <Button asChild size="sm" variant="ghost"><Link href={href}>View</Link></Button>
        </CardAction>
        <CardDescription>{detail}</CardDescription>
      </CardHeader>
      <CardContent>
        <p
          className={cn(
            "font-mono text-2xl font-semibold tracking-normal",
            tone === "success"
              ? "text-[var(--state-success)]"
              : tone === "error"
                ? "text-[var(--state-error)]"
                : "text-foreground"
          )}
        >
          {isGainCard
            ? formatSignedAmount(value, currency)
            : formatAmount(value, currency)}
        </p>
      </CardContent>
    </Card>
  )
}

interface AccountRowProps {
  readonly account: DashboardAccountItem
}

function AccountRow({ account }: AccountRowProps) {
  const Icon = accountTypeIcons[account.type]

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-md bg-muted">
            <Icon className="size-4" aria-hidden="true" />
          </div>
          <span className="font-medium">{account.name}</span>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="secondary">{account.typeLabel}</Badge>
      </TableCell>
      <TableCell className="text-right font-mono font-medium">
        {formatAmount(account.balance, account.currency)}
      </TableCell>
      <TableCell className="text-right font-mono text-muted-foreground">
        {account.share}%
      </TableCell>
    </TableRow>
  )
}

interface ActivityRowProps {
  readonly activity: RecentActivityItem
}

function ActivityRow({ activity }: ActivityRowProps) {
  const Icon =
    activity.tone === "success"
      ? ArrowDownLeftIcon
      : activity.tone === "error"
        ? ArrowUpRightIcon
        : ReceiptTextIcon

  return (
    <div className="flex items-center gap-3">
      <div className="flex size-9 items-center justify-center rounded-md bg-muted">
        <Icon className="size-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{activity.label}</p>
        <p className="truncate text-xs text-muted-foreground">
          {activity.account} · {formatDate(activity.occurredAt)}
        </p>
      </div>
      <span
        className={cn(
          "font-mono text-sm font-medium",
          activity.tone === "success"
            ? "text-[var(--state-success)]"
            : activity.tone === "error"
              ? "text-[var(--state-error)]"
              : "text-foreground"
        )}
      >
        {formatSignedAmount(activity.amount, activity.currency)}
      </span>
    </div>
  )
}

interface ComingSoonCardProps {
  readonly title: string
  readonly description: string
  readonly icon: typeof ReceiptTextIcon
}

function ComingSoonCard({ title, description, icon: Icon }: ComingSoonCardProps) {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardAction>
          <div className="flex size-9 items-center justify-center rounded-md bg-muted">
            <ClockIcon className="size-4 text-muted-foreground" aria-hidden="true" />
          </div>
        </CardAction>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="size-4" aria-hidden="true" />
          <span>Coming soon</span>
        </div>
      </CardContent>
    </Card>
  )
}

function EmptyAccountsState() {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <PiggyBankIcon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>Welcome to FinTrack</EmptyTitle>
        <EmptyDescription>
          Add your first financial account to see your net worth, balances, and
          recent activity on the dashboard.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild>
          <Link href="/accounts">
            <PlusIcon data-icon="inline-start" />
            Add account
          </Link>
        </Button>
      </EmptyContent>
    </Empty>
  )
}

function DashboardSkeleton() {
  return (
    <>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index}>
            <CardHeader>
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-3/4" />
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(360px,0.9fr)]">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-4 w-1/2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[280px] w-full rounded-lg" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-4 w-1/2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="mx-auto aspect-square h-[260px] rounded-full" />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(360px,0.9fr)]">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-4 w-1/2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="mx-auto aspect-square h-[260px] rounded-full" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-4 w-1/2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[200px] w-full rounded-lg" />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-4 w-1/2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[200px] w-full rounded-lg" />
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[120px] w-full rounded-lg" />
            </CardContent>
          </Card>
        </div>
      </section>
    </>
  )
}
