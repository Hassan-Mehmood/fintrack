"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { assetAllocation } from "@/features/dashboard/dashboard-data"

const performanceChartConfig = {
  income: {
    label: "Income",
    color: "var(--accent-primary)",
  },
  expenses: {
    label: "Expenses",
    color: "var(--state-error)",
  },
  investments: {
    label: "Investments",
    color: "var(--state-success)",
  },
} satisfies ChartConfig

const allocationChartConfig = {
  cash: {
    label: "Cash",
    color: "var(--accent-primary)",
  },
  brokerage: {
    label: "Brokerage",
    color: "var(--state-success)",
  },
  crypto: {
    label: "Crypto",
    color: "var(--state-warning)",
  },
  wallets: {
    label: "Wallets",
    color: "var(--text-muted)",
  },
} satisfies ChartConfig

const monthlyPerformance = [
  { month: "Jan", income: 420000, expenses: 238000, investments: 90000 },
  { month: "Feb", income: 455000, expenses: 251000, investments: 110000 },
  { month: "Mar", income: 438000, expenses: 224000, investments: 125000 },
  { month: "Apr", income: 470000, expenses: 263000, investments: 120000 },
  { month: "May", income: 492000, expenses: 276000, investments: 132000 },
  { month: "Jun", income: 510000, expenses: 281000, investments: 145000 },
] as const

export function IncomeExpenseInvestmentChart() {
  return (
    <ChartContainer
      config={performanceChartConfig}
      className="h-[280px] w-full"
      initialDimension={{ width: 720, height: 280 }}
    >
      <BarChart accessibilityLayer data={monthlyPerformance} barGap={4}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="month"
          tickLine={false}
          tickMargin={10}
          axisLine={false}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          tickFormatter={(value: number) => `${Math.round(value / 1000)}k`}
        />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent indicator="dot" />}
        />
        <Bar dataKey="income" fill="var(--color-income)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="expenses" fill="var(--color-expenses)" radius={[4, 4, 0, 0]} />
        <Bar
          dataKey="investments"
          fill="var(--color-investments)"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ChartContainer>
  )
}

export function AssetAllocationChart() {
  return (
    <ChartContainer
      config={allocationChartConfig}
      className="mx-auto aspect-square h-[260px]"
      initialDimension={{ width: 260, height: 260 }}
    >
      <PieChart accessibilityLayer>
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent hideLabel indicator="dot" />}
        />
        <Pie
          data={assetAllocation}
          dataKey="value"
          nameKey="label"
          innerRadius={58}
          outerRadius={96}
          strokeWidth={3}
        >
          {assetAllocation.map((item) => (
            <Cell key={item.name} fill={item.fill} />
          ))}
        </Pie>
      </PieChart>
    </ChartContainer>
  )
}
