"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  CheckIcon,
  CircleAlertIcon,
  FileUpIcon,
  RefreshCcwIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  accountListQueryKey,
  listAccounts,
} from "@/features/accounts/accounts-api";
import { type Account } from "@/features/accounts/account-types";
import { dashboardQueryKey } from "@/features/dashboard/dashboard-api";
import { categoriesQueryKey } from "@/features/categories/categories-api";
import { transactionsQueryKey } from "@/features/transactions/transactions-api";

type Mapping = { sourceAccountKey: string; accountId: string };
type Reconciliation = {
  accountId: string;
  externalBalance: string;
  includeAdjustment: boolean;
};
type ImportItem = {
  id: string;
  sourceLines: number[];
  type: "INCOME" | "EXPENSE" | "TRANSFER" | "ADJUSTMENT" | null;
  unresolved: boolean;
  accountKey: string;
  destinationAccountKey: string | null;
  category: string;
  currency: string;
  amount: string;
  occurredAt: string;
  duplicate: boolean;
  selected: boolean;
  valid: boolean;
  resolution: string | null;
};
type Preview = {
  sourceRowCount: number;
  sourceWallets: {
    accountKey: string;
    accountName: string;
    currency: string;
    suggestedAccountId: string | null;
  }[];
  items: ImportItem[];
  ordinaryExpenseCount: number;
  ordinaryIncomeCount: number;
  transferCount: number;
  unresolvedCount: number;
  invalidMappingCount: number;
};

export function TransactionImportPage() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [fileName, setFileName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [resolutions, setResolutions] = useState<
    { itemId: string; resolution: string }[]
  >([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const accounts = useQuery({
    queryKey: accountListQueryKey(),
    queryFn: () => listAccounts(getToken),
  });
  const refreshPreview = async (
    nextMappings = mappings,
    nextSelected = selectedIds,
    nextResolutions = resolutions,
  ) => {
    if (!csvText) return;
    setError(null);
    try {
      const result = await api<{ data: Preview }>(
        getToken,
        "/api/v1/transaction-imports/preview",
        {
          fileName,
          csvText,
          mappings: nextMappings,
          selectedItemIds: nextSelected.length ? nextSelected : undefined,
          resolutions: nextResolutions,
        },
      );
      setPreview(result.data);
      setMappings((current) =>
        current.length
          ? current
          : result.data.sourceWallets.flatMap((wallet) =>
              wallet.suggestedAccountId
                ? [
                    {
                      sourceAccountKey: wallet.accountKey,
                      accountId: wallet.suggestedAccountId,
                    },
                  ]
                : [],
            ),
      );
      if (!nextSelected.length)
        setSelectedIds(
          result.data.items
            .filter((item) => item.selected && !item.duplicate)
            .map((item) => item.id),
        );
    } catch (caught) {
      setError(message(caught));
    }
  };
  const commit = useMutation({
    mutationFn: () =>
      api<{
        data: {
          importedCount: number;
          skippedDuplicateCount: number;
          adjustmentCount: number;
        };
      }>(getToken, "/api/v1/transaction-imports", {
        fileName,
        csvText,
        mappings,
        selectedItemIds: selectedIds,
        resolutions,
        reconciliations: reconciliations
          .filter((entry) => entry.includeAdjustment && entry.externalBalance)
          .map((entry) => ({
            ...entry,
            expectedCurrentBalance:
              accounts.data?.find((account) => account.id === entry.accountId)
                ?.currentBalance ?? "0",
            occurredAt: new Date().toISOString(),
          })),
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: (result) => {
      toast.success(`Imported ${result.data.importedCount} transactions.`);
      void queryClient.invalidateQueries({ queryKey: transactionsQueryKey });
      void queryClient.invalidateQueries({ queryKey: accountListQueryKey() });
      void queryClient.invalidateQueries({ queryKey: dashboardQueryKey });
      void queryClient.invalidateQueries({ queryKey: categoriesQueryKey });
      setPreview(null);
      setCsvText("");
      setFileName("");
    },
    onError: (caught) => setError(message(caught)),
  });
  const compatible = (wallet: Preview["sourceWallets"][number]) =>
    (accounts.data ?? []).filter(
      (account) =>
        account.currency === wallet.currency &&
        account.type !== "CRYPTO_WALLET",
    );
  const mapped = useMemo(
    () =>
      new Map(
        mappings.map((mapping) => [
          mapping.sourceAccountKey,
          mapping.accountId,
        ]),
      ),
    [mappings],
  );
  const reconciliationAccounts = useMemo(
    () =>
      [...new Set(mappings.map((mapping) => mapping.accountId))]
        .map((accountId) =>
          accounts.data?.find((account) => account.id === accountId),
        )
        .filter((account): account is Account => Boolean(account)),
    [accounts.data, mappings],
  );
  return (
    <AppShell
      currentSection="transactions"
      title="Import transactions"
      description="Review a wallet CSV before adding it to your ledger."
    >
      <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <Button asChild size="sm" variant="ghost">
          <Link href="/transactions">
            <ArrowLeftIcon data-icon="inline-start" />
            Back to transactions
          </Link>
        </Button>
        {error ? (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>Import could not continue</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>1. Upload wallet export</CardTitle>
            <CardDescription>
              Choose the semicolon-delimited CSV exported by your wallet app.
              Files stay in this browser request and are not stored.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="wallet-csv">CSV file</FieldLabel>
                <Input
                  id="wallet-csv"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if (file.size > 1_000_000) {
                      setError("Choose a CSV smaller than 1 MB.");
                      return;
                    }
                    setFileName(file.name);
                    setCsvText(await file.text());
                    setMappings([]);
                    setSelectedIds([]);
                    setResolutions([]);
                    setPreview(null);
                  }}
                />
                <FieldDescription>
                  The exact wallet CSV format is supported in this first
                  version.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </CardContent>
          <CardFooter>
            <Button disabled={!csvText} onClick={() => void refreshPreview()}>
              <FileUpIcon data-icon="inline-start" />
              Preview import
            </Button>
          </CardFooter>
        </Card>
        {accounts.isLoading ? <Skeleton className="h-32" /> : null}
        {preview ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>2. Map wallets</CardTitle>
                <CardDescription>
                  {preview.sourceRowCount} source rows found. Saved and
                  exact-name matches are suggested.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {preview.sourceWallets.map((wallet) => (
                  <Field key={wallet.accountKey}>
                    <FieldLabel>
                      {wallet.accountName}{" "}
                      <span className="font-mono text-muted-foreground">
                        {wallet.currency}
                      </span>
                    </FieldLabel>
                    <Select
                      value={
                        mapped.get(wallet.accountKey) ??
                        wallet.suggestedAccountId ??
                        ""
                      }
                      onValueChange={(accountId) => {
                        const next = [
                          ...mappings.filter(
                            (mapping) =>
                              mapping.sourceAccountKey !== wallet.accountKey,
                          ),
                          { sourceAccountKey: wallet.accountKey, accountId },
                        ];
                        setMappings(next);
                        void refreshPreview(next);
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a FinTrack account" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {compatible(wallet).map((account: Account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.name} ({account.type.replace("_", " ")})
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>3. Review transactions</CardTitle>
                <CardDescription>
                  {preview.ordinaryExpenseCount} expenses,{" "}
                  {preview.ordinaryIncomeCount} income entries, and{" "}
                  {preview.transferCount} transfers. Duplicates are skipped
                  automatically.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Select</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.includes(item.id)}
                            disabled={item.duplicate}
                            onCheckedChange={(checked) =>
                              setSelectedIds((current) =>
                                checked
                                  ? [...current, item.id]
                                  : current.filter((id) => id !== item.id),
                              )
                            }
                          />
                        </TableCell>
                        <TableCell>
                          {new Date(item.occurredAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          {item.unresolved ? (
                            <Select
                              value={item.resolution ?? ""}
                              onValueChange={(resolution) => {
                                const next = [
                                  ...resolutions.filter(
                                    (entry) => entry.itemId !== item.id,
                                  ),
                                  { itemId: item.id, resolution },
                                ];
                                setResolutions(next);
                                void refreshPreview(
                                  mappings,
                                  selectedIds,
                                  next,
                                );
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Resolve transfer" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  <SelectItem value="SKIP">Skip</SelectItem>
                                  <SelectItem value="INCOME">Income</SelectItem>
                                  <SelectItem value="EXPENSE">
                                    Expense
                                  </SelectItem>
                                  <SelectItem value="ADJUSTMENT">
                                    Adjustment
                                  </SelectItem>
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          ) : (
                            item.type
                          )}
                        </TableCell>
                        <TableCell>{item.category}</TableCell>
                        <TableCell className="text-right font-mono">
                          {item.currency} {item.amount}
                        </TableCell>
                        <TableCell>
                          {item.duplicate ? (
                            <Badge variant="secondary">Already imported</Badge>
                          ) : item.valid ? (
                            <Badge variant="outline">Ready</Badge>
                          ) : (
                            <Badge variant="destructive">Map wallet</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
              <CardFooter className="flex justify-between">
                <span className="text-sm text-muted-foreground">
                  {selectedIds.length} selected
                </span>
                <Button variant="outline" onClick={() => void refreshPreview()}>
                  <RefreshCcwIcon data-icon="inline-start" />
                  Refresh preview
                </Button>
              </CardFooter>
            </Card>
            {reconciliationAccounts.length ? (
              <Card>
                <CardHeader>
                  <CardTitle>4. Reconcile balances</CardTitle>
                  <CardDescription>
                    Optionally enter a source-app balance and enable its
                    reviewed adjustment.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {reconciliationAccounts.map((account) => {
                    const reconciliation = reconciliations.find(
                      (entry) => entry.accountId === account.id,
                    );
                    return (
                      <Field key={account.id} orientation="horizontal">
                        <Checkbox
                          id={`reconcile-${account.id}`}
                          checked={reconciliation?.includeAdjustment ?? false}
                          onCheckedChange={(checked) =>
                            setReconciliations((current) => [
                              ...current.filter(
                                (entry) => entry.accountId !== account.id,
                              ),
                              {
                                accountId: account.id,
                                externalBalance:
                                  reconciliation?.externalBalance ?? "",
                                includeAdjustment: checked === true,
                              },
                            ])
                          }
                        />
                        <FieldLabel htmlFor={`reconcile-${account.id}`}>
                          {account.name} (FinTrack: {account.currentBalance})
                        </FieldLabel>
                        <Input
                          aria-label={`${account.name} source balance`}
                          inputMode="decimal"
                          placeholder="Source balance"
                          value={reconciliation?.externalBalance ?? ""}
                          onChange={(event) =>
                            setReconciliations((current) => [
                              ...current.filter(
                                (entry) => entry.accountId !== account.id,
                              ),
                              {
                                accountId: account.id,
                                externalBalance: event.target.value,
                                includeAdjustment:
                                  reconciliation?.includeAdjustment ?? false,
                              },
                            ])
                          }
                        />
                      </Field>
                    );
                  })}
                </CardContent>
              </Card>
            ) : null}
            <Card>
              <CardHeader>
                <CardTitle>5. Import selected transactions</CardTitle>
                <CardDescription>
                  Transactions are added atomically. Existing records are never
                  replaced.
                </CardDescription>
              </CardHeader>
              <CardFooter>
                <Button
                  disabled={
                    commit.isPending ||
                    preview.unresolvedCount > 0 ||
                    preview.invalidMappingCount > 0 ||
                    !selectedIds.length
                  }
                  onClick={() => commit.mutate()}
                >
                  {commit.isPending ? (
                    <>Importing…</>
                  ) : (
                    <>
                      <CheckIcon data-icon="inline-start" />
                      Import {selectedIds.length} transactions
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          </>
        ) : null}
      </main>
    </AppShell>
  );
}

async function api<T>(
  getToken: () => Promise<string | null>,
  path: string,
  body: unknown,
): Promise<T> {
  const token = await getToken();
  if (!token) throw new Error("Unable to read the active Clerk session token.");
  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
  if (!base) throw new Error("NEXT_PUBLIC_API_BASE_URL is required.");
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(data?.error?.message ?? "Import request failed.");
  }
  return response.json() as Promise<T>;
}
function message(error: unknown): string {
  return error instanceof Error ? error.message : "Import request failed.";
}
