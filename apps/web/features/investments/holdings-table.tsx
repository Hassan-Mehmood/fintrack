import { TrendingDownIcon, TrendingUpIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { formatAmount, formatDate } from "@/lib/formatting"

import type { Holding } from "./investment-types"

interface HoldingsTableProps {
  readonly baseCurrency: string
  readonly holdings: readonly Holding[]
}

export function HoldingsTable({ baseCurrency, holdings }: HoldingsTableProps) {
  if (holdings.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground py-8">
        No holdings found. Record investment buy or sell transactions to build
        your portfolio.
      </p>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Asset</TableHead>
          <TableHead>Category</TableHead>
          <TableHead className="text-right">Quantity</TableHead>
          <TableHead className="text-right">Avg. cost</TableHead>
          <TableHead className="text-right">Current price</TableHead>
          <TableHead className="text-right">Cost basis</TableHead>
          <TableHead className="text-right">Current value</TableHead>
          <TableHead className="text-right">Unrealized</TableHead>
          <TableHead className="text-right">Realized</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {holdings.map((holding) => (
          <TableRow key={holding.assetId}>
            <TableCell>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-medium">
                  {holding.assetName}
                </span>
                {holding.assetSymbol ? (
                  <span className="truncate text-xs font-mono text-muted-foreground">
                    {holding.assetSymbol}
                  </span>
                ) : null}
              </div>
            </TableCell>
            <TableCell>
              <Badge variant="secondary">{holding.categoryName}</Badge>
            </TableCell>
            <TableCell className="text-right font-mono">
              {holding.quantity}
            </TableCell>
            <TableCell className="text-right font-mono">
              {holding.averageCost
                ? formatAmount(holding.averageCost, baseCurrency)
                : "—"}
            </TableCell>
            <TableCell className="text-right font-mono">
              <div className="flex flex-col items-end gap-1">
                <span>
                  {holding.currentPrice
                    ? formatAmount(holding.currentPrice, baseCurrency)
                    : "Unavailable"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {holding.priceProvider ?? "Manual"}
                  {holding.priceType === "EOD" ? " · End of day" : ""}
                  {holding.priceStatus === "STALE" ? " · Stale" : ""}
                  {holding.providerDate
                    ? ` · ${formatDate(`${holding.providerDate}T00:00:00`)}`
                    : holding.priceUpdatedAt
                      ? ` · ${formatDate(holding.priceUpdatedAt)}`
                    : ""}
                </span>
              </div>
            </TableCell>
            <TableCell className="text-right font-mono">
              {formatAmount(holding.costBasis, baseCurrency)}
            </TableCell>
            <TableCell className="text-right font-mono">
              {holding.currentValue
                ? formatAmount(holding.currentValue, baseCurrency)
                : "Unavailable"}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex flex-col items-end gap-0.5">
                <span
                  className={cn(
                    "font-mono font-medium",
                    getGainColor(holding.unrealizedGain)
                  )}
                >
                  {holding.unrealizedGain
                    ? formatSignedAmount(holding.unrealizedGain, baseCurrency)
                    : "Unavailable"}
                </span>
                {holding.unrealizedGainPercent !== null ? (
                  <span className="flex items-center gap-1 text-xs">
                    {Number(holding.unrealizedGainPercent) >= 0 ? (
                      <TrendingUpIcon className="size-3" aria-hidden="true" />
                    ) : (
                      <TrendingDownIcon className="size-3" aria-hidden="true" />
                    )}
                    {Math.abs(holding.unrealizedGainPercent).toFixed(2)}%
                  </span>
                ) : null}
              </div>
            </TableCell>
            <TableCell
              className={cn(
                "text-right font-mono font-medium",
                getGainColor(holding.realizedGain)
              )}
            >
              {formatSignedAmount(holding.realizedGain, baseCurrency)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function getGainColor(amount: string | null): string {
  if (amount === null) {
    return "text-muted-foreground"
  }
  const value = Number(amount)

  if (value > 0) {
    return "text-[var(--state-success)]"
  }

  if (value < 0) {
    return "text-[var(--state-error)]"
  }

  return "text-foreground"
}

function formatSignedAmount(amount: string, currency: string): string {
  const value = Number(amount)
  const sign = value < 0 ? "-" : "+"
  const absolute = formatAmount(Math.abs(value).toString(), currency)

  return `${sign} ${absolute}`
}
