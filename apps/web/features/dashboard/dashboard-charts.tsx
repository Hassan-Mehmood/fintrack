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
import type {
  AssetAllocationItem,
  InvestmentAllocationItem,
  MonthlySummaryItem,
} from "./dashboard-types"

const performanceChartConfig = {
  income: {
    label: "Income",
    color: "var(--accent-primary)",
  },
  expenses: {
    label: "Expenses",
    color: "var(--state-error)",
  },
} satisfies ChartConfig

const allocationChartConfig = {
  bank: {
    label: "Bank accounts",
    color: "var(--accent-primary)",
  },
  "cash-wallet": {
    label: "Cash wallets",
    color: "var(--state-success)",
  },
  "digital-wallet": {
    label: "Digital wallets",
    color: "var(--state-warning)",
  },
} satisfies ChartConfig

const allocationFills: Record<string, string> = {
  bank: "var(--color-bank)",
  "cash-wallet": "var(--color-cash-wallet)",
  "digital-wallet": "var(--color-digital-wallet)",
}

interface IncomeExpenseInvestmentChartProps {
  readonly data: readonly MonthlySummaryItem[]
}

export function IncomeExpenseInvestmentChart({
  data,
}: IncomeExpenseInvestmentChartProps) {
  const chartData = data.map((item) => ({
    month: item.month,
    income: Number(item.income),
    expenses: Number(item.expenses),
  }))

  return (
    <ChartContainer
      config={performanceChartConfig}
      className="h-[280px] w-full"
      initialDimension={{ width: 720, height: 280 }}
    >
      <BarChart accessibilityLayer data={chartData} barGap={4}>
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
      </BarChart>
    </ChartContainer>
  )
}

interface AssetAllocationChartProps {
  readonly data: readonly AssetAllocationItem[]
}

export function AssetAllocationChart({ data }: AssetAllocationChartProps) {
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
          data={data}
          dataKey="value"
          nameKey="label"
          innerRadius={58}
          outerRadius={96}
          strokeWidth={3}
        >
          {data.map((item) => (
            <Cell key={item.name} fill={allocationFills[item.name]} />
          ))}
        </Pie>
      </PieChart>
    </ChartContainer>
  )
}

const investmentAllocationPalette = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

interface InvestmentAllocationChartProps {
  readonly data: readonly InvestmentAllocationItem[]
}

export function InvestmentAllocationChart({
  data,
}: InvestmentAllocationChartProps) {
  const chartConfig = data.reduce<ChartConfig>((config, item, index) => {
    config[item.category] = {
      label: item.category,
      color: investmentAllocationPalette[index % investmentAllocationPalette.length],
    }
    return config
  }, {})

  return (
    <ChartContainer
      config={chartConfig}
      className="mx-auto aspect-square h-[260px]"
      initialDimension={{ width: 260, height: 260 }}
    >
      <PieChart accessibilityLayer>
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent hideLabel indicator="dot" />}
        />
        <Pie
          data={data}
          dataKey="value"
          nameKey="category"
          innerRadius={58}
          outerRadius={96}
          strokeWidth={3}
        >
          {data.map((item) => (
            <Cell key={item.category} fill={`var(--color-${item.category})`} />
          ))}
        </Pie>
      </PieChart>
    </ChartContainer>
  )
}
