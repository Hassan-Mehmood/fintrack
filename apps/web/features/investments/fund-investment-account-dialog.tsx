"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Decimal from "decimal.js";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
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
import { Spinner } from "@/components/ui/spinner";
import {
  accountsQueryKey,
  adjustAccountBalance,
} from "@/features/accounts/accounts-api";
import type { Account } from "@/features/accounts/account-types";
import { dashboardQueryKey } from "@/features/dashboard/dashboard-api";
import { portfoliosQueryKey } from "@/features/portfolios/portfolios-api";
import {
  createTransaction,
  transactionsQueryKey,
} from "@/features/transactions/transactions-api";
import { holdingsQueryKey, investmentSummaryQueryKey } from "./investments-api";

type FundingMethod = "SET_BALANCE" | "TRACKED_TRANSFER" | "EXTERNAL";

export function FundInvestmentAccountDialog({
  account,
  accounts,
  getToken,
  onOpenChange,
  open,
}: {
  readonly account: Account;
  readonly accounts: readonly Account[];
  readonly getToken: () => Promise<string | null>;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}) {
  const queryClient = useQueryClient();
  const [method, setMethod] = useState<FundingMethod>("TRACKED_TRANSFER");
  const [sourceAccountId, setSourceAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const submissionKey = useRef(crypto.randomUUID());
  const eligibleSources = accounts.filter(
    (candidate) =>
      candidate.id !== account.id && candidate.currency === account.currency,
  );
  const parsed = parsePositiveAmount(amount);

  const mutation = useMutation({
    mutationFn: async () => {
      if (method === "TRACKED_TRANSFER") {
        if (!sourceAccountId || !parsed)
          throw new Error(
            "Select a source account and enter an amount greater than zero.",
          );
        return createTransaction(getToken, {
          idempotencyKey: submissionKey.current,
          type: "TRANSFER",
          status: "CLEARED",
          accountId: sourceAccountId,
          destinationAccountId: account.id,
          amount: parsed,
          currency: account.currency,
          occurredAt: new Date().toISOString(),
          category: "Transfer",
          description: `Fund ${account.name}`,
          labels: [],
        });
      }

      if (!parsed) throw new Error("Enter a valid amount.");
      const target =
        method === "SET_BALANCE"
          ? parsed
          : new Decimal(account.currentBalance).add(parsed).toFixed();
      return adjustAccountBalance(getToken, account.id, {
        currentBalance: target,
        expectedBalance: new Decimal(account.currentBalance).toFixed(),
        currency: account.currency,
        idempotencyKey: submissionKey.current,
      });
    },
    onSuccess: async () => {
      toast.success(
        method === "TRACKED_TRANSFER"
          ? "Cash transferred."
          : "Cash balance updated.",
      );
      await Promise.all(
        [
          accountsQueryKey,
          dashboardQueryKey,
          transactionsQueryKey,
          portfoliosQueryKey,
          holdingsQueryKey,
          investmentSummaryQueryKey,
          ["investments", "accounts", account.id, "summary"],
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
      close(false);
    },
  });

  function close(nextOpen: boolean) {
    if (!nextOpen && !mutation.isPending) {
      setAmount("");
      setSourceAccountId("");
      submissionKey.current = crypto.randomUUID();
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add cash</DialogTitle>
          <DialogDescription>
            Fund {account.name} without creating a duplicate cash asset.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>Funding method</FieldLabel>
            <Select
              value={method}
              onValueChange={(value) => setMethod(value as FundingMethod)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="TRACKED_TRANSFER">
                    Transfer from a tracked account
                  </SelectItem>
                  <SelectItem value="EXTERNAL">
                    Add from an external source
                  </SelectItem>
                  <SelectItem value="SET_BALANCE">
                    Set current cash balance
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>
              External additions are recorded as audited balance adjustments,
              not income.
            </FieldDescription>
          </Field>
          {method === "TRACKED_TRANSFER" ? (
            <Field>
              <FieldLabel>From account</FieldLabel>
              <Select
                value={sourceAccountId}
                onValueChange={setSourceAccountId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select source account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {eligibleSources.length === 0 ? (
                      <SelectItem value="none" disabled>
                        No same-currency accounts available
                      </SelectItem>
                    ) : null}
                    {eligibleSources.map((candidate) => (
                      <SelectItem key={candidate.id} value={candidate.id}>
                        {candidate.name} · {candidate.currentBalance}{" "}
                        {candidate.currency}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          <Field data-invalid={(Boolean(amount) && !parsed) || undefined}>
            <FieldLabel>
              {method === "SET_BALANCE"
                ? `Current balance (${account.currency})`
                : `Amount (${account.currency})`}
            </FieldLabel>
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              aria-invalid={(Boolean(amount) && !parsed) || undefined}
            />
            <FieldError>
              {Boolean(amount) && !parsed
                ? "Enter an amount greater than zero."
                : null}
            </FieldError>
          </Field>
        </FieldGroup>
        {mutation.isError ? (
          <Alert variant="destructive">
            <AlertTitle>Unable to add cash</AlertTitle>
            <AlertDescription>{mutation.error.message}</AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => close(false)}
          >
            Cancel
          </Button>
          <Button
            disabled={
              mutation.isPending ||
              !parsed ||
              (method === "TRACKED_TRANSFER" && !sourceAccountId)
            }
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
            Save cash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function parsePositiveAmount(value: string): string | null {
  if (!/^(?:0|[1-9]\d{0,15})(?:\.\d{1,8})?$/.test(value.trim())) return null;
  const decimal = new Decimal(value);
  return decimal.greaterThan(0) ? decimal.toFixed() : null;
}
