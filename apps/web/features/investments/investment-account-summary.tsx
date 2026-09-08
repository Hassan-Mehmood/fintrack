"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatAmount, formatSignedAmount } from "@/lib/formatting";
import { getInvestmentAccountSummary } from "./investments-api";
import { HoldingsTable } from "./holdings-table";

export function InvestmentAccountSummaryPanel({
  accountId,
  getToken,
}: {
  readonly accountId: string;
  readonly getToken: () => Promise<string | null>;
}) {
  const query = useQuery({
    queryKey: ["investments", "accounts", accountId, "summary"],
    queryFn: () => getInvestmentAccountSummary(getToken, accountId),
  });
  if (query.isLoading) return <Skeleton className="h-36" />;
  if (!query.data) return null;
  const data = query.data;
  const metrics = [
    [
      "Total account value",
      data.totalAccountValue
        ? formatAmount(data.totalAccountValue, data.reportingCurrency)
        : "Unavailable",
    ],
    ...(data.accountType === "BROKER"
      ? ([
          [
            "Available fiat cash",
            formatAmount(data.availableFiatCash, data.accountCurrency),
          ],
        ] as const)
      : []),
    [
      "Cash equivalents",
      formatAmount(data.cashEquivalentValue, data.reportingCurrency),
    ],
    [
      "Other investments",
      formatAmount(data.investedValue, data.reportingCurrency),
    ],
    [
      "Total liquidity",
      data.totalLiquidity
        ? formatAmount(data.totalLiquidity, data.reportingCurrency)
        : "Unavailable",
    ],
    [
      "Cost basis",
      data.costBasis
        ? formatAmount(data.costBasis, data.reportingCurrency)
        : "Unavailable",
    ],
    [
      "Unrealized gain",
      data.unrealizedGain
        ? formatSignedAmount(data.unrealizedGain, data.reportingCurrency)
        : "Unavailable",
    ],
    [
      "Realized gain",
      data.realizedGain
        ? formatSignedAmount(data.realizedGain, data.reportingCurrency)
        : "Unavailable",
    ],
  ] as const;
  const holdings = [...data.holdings].sort(
    (left, right) =>
      Number(right.holdingKind === "FIAT_CASH") -
      Number(left.holdingKind === "FIAT_CASH"),
  );
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Investment account</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map(([label, value]) => (
            <div key={label}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="font-mono font-medium">{value}</p>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Holdings</CardTitle>
          <CardDescription>
            {data.accountType === "CRYPTO_WALLET"
              ? "Stablecoins provide wallet liquidity and remain asset positions."
              : "Cash is derived from the account ledger; investments remain asset positions."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HoldingsTable
            groupBy="NONE"
            holdings={holdings}
            reportingCurrency={data.reportingCurrency as "USD" | "PKR"}
          />
        </CardContent>
      </Card>
    </div>
  );
}
