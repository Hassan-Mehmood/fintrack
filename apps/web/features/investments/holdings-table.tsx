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
import {
  formatAmount,
  formatDate,
  formatSignedAmount,
} from "@/lib/formatting"
import { cn } from "@/lib/utils"

import type {
  Holding,
  HoldingGroupBy,
  ReportingCurrency,
} from "./investment-types"

interface HoldingsTableProps {
  readonly groupBy: HoldingGroupBy
  readonly holdings: readonly Holding[]
  readonly reportingCurrency: ReportingCurrency
}

export function HoldingsTable({
  groupBy,
  holdings,
  reportingCurrency,
}: HoldingsTableProps) {
  if (holdings.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No holdings match the selected filters.
      </p>
    )
  }

  const groups = groupHoldings(holdings, groupBy)

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Asset</TableHead>
          <TableHead>Account</TableHead>
          <TableHead>Asset type</TableHead>
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
        {groups.flatMap(([groupLabel, groupHoldings]) => [
          ...(groupBy === "NONE"
            ? []
            : [
                <TableRow key={`group-${groupLabel}`}>
                  <TableCell
                    colSpan={10}
                    className="bg-muted/50 font-medium"
                  >
                    {groupLabel}
                  </TableCell>
                </TableRow>,
              ]),
          ...groupHoldings.map((holding) => (
            <HoldingRow
              key={`${holding.assetId}:${holding.accountId}`}
              holding={holding}
              reportingCurrency={reportingCurrency}
            />
          )),
        ])}
      </TableBody>
    </Table>
  )
}

function HoldingRow({
  holding,
  reportingCurrency,
}: {
  readonly holding: Holding
  readonly reportingCurrency: ReportingCurrency
}) {
  const showNativeSecondary =
    reportingCurrency !== "NATIVE" &&
    holding.nativeCurrency !== holding.reportingCurrency

  return (
    <TableRow>
      <TableCell>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-medium">{holding.assetName}</span>
          {holding.assetSymbol ? (
            <span className="truncate font-mono text-xs text-muted-foreground">
              {holding.assetSymbol}
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-medium">{holding.accountName}</span>
          <span className="font-mono text-xs text-muted-foreground">
            {holding.accountCurrency}
            {holding.portfolios.length > 0
              ? ` · ${holding.portfolios.map(({ name }) => name).join(", ")}`
              : ""}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="secondary">{holding.categoryName}</Badge>
      </TableCell>
      <TableCell className="text-right font-mono">
        {holding.quantity}
      </TableCell>
      <MoneyCell
        amount={holding.averageCost}
        currency={holding.reportingCurrency}
        nativeAmount={holding.nativeAverageCost}
        nativeCurrency={holding.nativeCurrency}
        showNative={showNativeSecondary}
      />
      <TableCell className="text-right font-mono">
        <div className="flex flex-col items-end gap-1">
          <span>
            {holding.currentPrice
              ? formatAmount(holding.currentPrice, holding.reportingCurrency)
              : "Unavailable"}
          </span>
          {showNativeSecondary && holding.nativeCurrentPrice ? (
            <span className="text-xs text-muted-foreground">
              Native:{" "}
              {formatAmount(
                holding.nativeCurrentPrice,
                holding.nativeCurrency
              )}
            </span>
          ) : null}
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
      <MoneyCell
        amount={holding.costBasis}
        currency={holding.reportingCurrency}
        nativeAmount={holding.nativeCostBasis}
        nativeCurrency={holding.nativeCurrency}
        showNative={showNativeSecondary}
      />
      <MoneyCell
        amount={holding.currentValue}
        currency={holding.reportingCurrency}
        nativeAmount={holding.nativeCurrentValue}
        nativeCurrency={holding.nativeCurrency}
        showNative={showNativeSecondary}
      />
      <TableCell className="text-right">
        <div className="flex flex-col items-end gap-0.5">
          <span
            className={cn(
              "font-mono font-medium",
              getGainColor(holding.unrealizedGain)
            )}
          >
            {holding.unrealizedGain
              ? formatSignedAmount(
                  holding.unrealizedGain,
                  holding.reportingCurrency
                )
              : "Unavailable"}
          </span>
          {showNativeSecondary && holding.nativeUnrealizedGain ? (
            <span className="font-mono text-xs text-muted-foreground">
              Native:{" "}
              {formatSignedAmount(
                holding.nativeUnrealizedGain,
                holding.nativeCurrency
              )}
            </span>
          ) : null}
          {holding.unrealizedGainPercent !== null ? (
            <span className="flex items-center gap-1 text-xs">
              {Number(holding.unrealizedGainPercent) >= 0 ? (
                <TrendingUpIcon aria-hidden="true" />
              ) : (
                <TrendingDownIcon aria-hidden="true" />
              )}
              {Math.abs(holding.unrealizedGainPercent).toFixed(2)}%
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex flex-col items-end gap-0.5">
          <span
            className={cn(
              "font-mono font-medium",
              getGainColor(holding.realizedGain)
            )}
          >
            {holding.realizedGain
              ? formatSignedAmount(
                  holding.realizedGain,
                  holding.reportingCurrency
                )
              : "Unavailable"}
          </span>
          {showNativeSecondary && holding.nativeRealizedGain ? (
            <span className="font-mono text-xs text-muted-foreground">
              Native:{" "}
              {formatSignedAmount(
                holding.nativeRealizedGain,
                holding.nativeCurrency
              )}
            </span>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  )
}

function MoneyCell({
  amount,
  currency,
  nativeAmount,
  nativeCurrency,
  showNative,
}: {
  readonly amount: string | null
  readonly currency: string
  readonly nativeAmount: string | null
  readonly nativeCurrency: string
  readonly showNative: boolean
}) {
  return (
    <TableCell className="text-right font-mono">
      <div className="flex flex-col items-end gap-0.5">
        <span>{amount ? formatAmount(amount, currency) : "Unavailable"}</span>
        {showNative && nativeAmount ? (
          <span className="text-xs text-muted-foreground">
            Native: {formatAmount(nativeAmount, nativeCurrency)}
          </span>
        ) : null}
      </div>
    </TableCell>
  )
}

function groupHoldings(
  holdings: readonly Holding[],
  groupBy: HoldingGroupBy
): ReadonlyArray<readonly [string, readonly Holding[]]> {
  const groups = new Map<string, Holding[]>()

  for (const holding of holdings) {
    const label = getGroupLabel(holding, groupBy)
    groups.set(label, [...(groups.get(label) ?? []), holding])
  }

  return [...groups.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  )
}

function getGroupLabel(holding: Holding, groupBy: HoldingGroupBy): string {
  switch (groupBy) {
    case "ACCOUNT":
      return `${holding.accountName} · ${holding.accountCurrency}`
    case "PORTFOLIO":
      return holding.portfolios.length > 0
        ? holding.portfolios.map(({ name }) => name).join(", ")
        : "No portfolio"
    case "ASSET_TYPE":
      return holding.categoryName
    case "CURRENCY":
      return holding.nativeCurrency
    case "NONE":
      return "All holdings"
  }
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
