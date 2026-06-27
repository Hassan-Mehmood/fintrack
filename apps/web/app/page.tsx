import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  BanknoteIcon,
  BitcoinIcon,
  BriefcaseBusinessIcon,
  CircleDollarSignIcon,
  CreditCardIcon,
  LandmarkIcon,
  PlusIcon,
  ReceiptTextIcon,
  WalletCardsIcon,
} from "lucide-react"

import { AppShell } from "@/components/app-shell"
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
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AssetAllocationChart,
  IncomeExpenseInvestmentChart,
} from "@/features/dashboard/dashboard-charts"
import { assetAllocation } from "@/features/dashboard/dashboard-data"
import { cn } from "@/lib/utils"

const metricCards = [
  {
    label: "Total net worth",
    value: "PKR 4,875,400",
    detail: "+8.2% from last month",
    icon: CircleDollarSignIcon,
  },
  {
    label: "Liquid cash",
    value: "PKR 1,925,000",
    detail: "39.5% of total assets",
    icon: BanknoteIcon,
  },
  {
    label: "Invested cash",
    value: "PKR 2,612,800",
    detail: "+PKR 145,000 this month",
    icon: BriefcaseBusinessIcon,
  },
] as const

const wallets = [
  {
    name: "HBL Current",
    type: "Bank account",
    balance: "PKR 820,000",
    share: "16.8%",
    icon: LandmarkIcon,
  },
  {
    name: "Cash Wallet",
    type: "Cash wallet",
    balance: "PKR 185,000",
    share: "3.8%",
    icon: WalletCardsIcon,
  },
  {
    name: "JazzCash",
    type: "Digital wallet",
    balance: "PKR 125,000",
    share: "2.6%",
    icon: CreditCardIcon,
  },
  {
    name: "Brokerage Account",
    type: "Broker account",
    balance: "PKR 1,892,800",
    share: "38.8%",
    icon: BriefcaseBusinessIcon,
  },
  {
    name: "Crypto Wallet",
    type: "Crypto wallet",
    balance: "PKR 720,000",
    share: "14.8%",
    icon: BitcoinIcon,
  },
] as const

const expenseBreakdown = [
  { category: "Housing", spent: "PKR 118,000", value: 42 },
  { category: "Food and groceries", spent: "PKR 64,500", value: 23 },
  { category: "Transport", spent: "PKR 38,200", value: 14 },
  { category: "Utilities", spent: "PKR 31,800", value: 11 },
  { category: "Subscriptions", spent: "PKR 18,500", value: 7 },
] as const

const recentActivity = [
  {
    label: "Salary received",
    account: "HBL Current",
    amount: "+PKR 425,000",
    icon: ArrowDownLeftIcon,
    tone: "success",
  },
  {
    label: "Brokerage contribution",
    account: "Brokerage Account",
    amount: "-PKR 120,000",
    icon: ArrowUpRightIcon,
    tone: "neutral",
  },
  {
    label: "Groceries",
    account: "Cash Wallet",
    amount: "-PKR 14,800",
    icon: ReceiptTextIcon,
    tone: "error",
  },
] as const

export default function Home() {
  return (
    <AppShell
      currentSection="dashboard"
      title="Dashboard"
      description="Overview for June 2026"
      primaryAction={
        <Button size="sm">
          <PlusIcon data-icon="inline-start" />
          Record
        </Button>
      }
    >
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
        <section className="grid gap-4 md:grid-cols-3">
          {metricCards.map((metric) => (
            <Card key={metric.label}>
              <CardHeader>
                <CardTitle>{metric.label}</CardTitle>
                <CardAction>
                  <div className="flex size-9 items-center justify-center rounded-md bg-muted">
                    <metric.icon className="size-4" aria-hidden="true" />
                  </div>
                </CardAction>
                <CardDescription>{metric.detail}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="font-mono text-2xl font-semibold tracking-normal">
                  {metric.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(360px,0.9fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Income vs expenses vs investments</CardTitle>
              <CardDescription>
                Monthly movement across cash flow and invested capital.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <IncomeExpenseInvestmentChart />
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
              <AssetAllocationChart />
              <div className="grid gap-2">
                {assetAllocation.map((item) => (
                  <div key={item.name} className="flex items-center justify-between gap-3 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: item.fill }}
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

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Connected wallets</CardTitle>
              <CardDescription>
                Balances across bank, cash, digital, broker, and crypto accounts.
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
                  {wallets.map((wallet) => (
                    <TableRow key={wallet.name}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex size-8 items-center justify-center rounded-md bg-muted">
                            <wallet.icon className="size-4" aria-hidden="true" />
                          </div>
                          <span className="font-medium">{wallet.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{wallet.type}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {wallet.balance}
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {wallet.share}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Expense breakdown</CardTitle>
                <CardDescription>
                  Spending by category for the current month.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {expenseBreakdown.map((expense) => (
                  <div key={expense.category} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate font-medium">{expense.category}</span>
                      <span className="font-mono text-muted-foreground">
                        {expense.spent}
                      </span>
                    </div>
                    <Progress value={expense.value} aria-label={`${expense.category} spending`} />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent activity</CardTitle>
                <CardDescription>
                  Latest recorded account movements.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {recentActivity.map((activity) => (
                  <div key={activity.label} className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-md bg-muted">
                      <activity.icon className="size-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{activity.label}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {activity.account}
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
                      {activity.amount}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    </AppShell>
  )
}
