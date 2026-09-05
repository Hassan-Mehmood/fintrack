"use client"

import { useRef } from "react"
import { useForm, useWatch } from "react-hook-form"
import { useAuth } from "@clerk/nextjs"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import Decimal from "decimal.js"
import { z } from "zod/v4"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { dashboardQueryKey } from "@/features/dashboard/dashboard-api"
import { transactionsQueryKey } from "@/features/transactions/transactions-api"
import { portfoliosQueryKey } from "@/features/portfolios/portfolios-api"
import { accountsQueryKey, adjustAccountBalance } from "./accounts-api"
import type { Account } from "./account-types"

const BalanceDecimal = Decimal.clone({ precision: 40 })
const balanceSchema = z
  .string()
  .trim()
  .regex(
    /^-?(?:0|[1-9]\d{0,15})(?:\.\d{1,8})?$/,
    "Enter a balance with up to 16 integer digits and 8 decimal places."
  )

export function AdjustBalanceDialog({
  account,
  onClose
}: {
  readonly account: Account
  readonly onClose: () => void
}) {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  const submission = useRef<{ target: string; key: string } | null>(null)
  const form = useForm<{ currentBalance: string }>({
    defaultValues: {
      currentBalance: new BalanceDecimal(account.currentBalance).toFixed()
    }
  })
  const balanceValue = useWatch({
    control: form.control,
    name: "currentBalance"
  })
  const parsedBalance = balanceSchema.safeParse(balanceValue)
  const difference = parsedBalance.success
    ? new BalanceDecimal(parsedBalance.data).sub(account.currentBalance)
    : null
  const mutation = useMutation({
    mutationFn: (payload: Parameters<typeof adjustAccountBalance>[2]) =>
      adjustAccountBalance(getToken, account.id, payload),
    onSuccess: async () => {
      toast.success("Account balance adjusted")
      await Promise.all(
        [
          accountsQueryKey,
          dashboardQueryKey,
          transactionsQueryKey,
          portfoliosQueryKey
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey }))
      )
      onClose()
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: accountsQueryKey })
    }
  })

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose()
      }}
    >
      <DialogContent
        showCloseButton={!mutation.isPending}
        className="sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>Adjust balance</DialogTitle>
          <DialogDescription>
            Set the current balance of {account.name}. The difference will be
            recorded today as a transaction in the Balance adjustment category.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            void form.handleSubmit(async (values) => {
              const parsed = balanceSchema.safeParse(values.currentBalance)
              if (!parsed.success) {
                form.setError("currentBalance", {
                  message: parsed.error.issues[0]?.message
                })
                return
              }
              const target = new BalanceDecimal(parsed.data).toFixed()
              if (new BalanceDecimal(target).eq(account.currentBalance)) return
              if (!submission.current || submission.current.target !== target) {
                submission.current = { target, key: crypto.randomUUID() }
              }
              try {
                await mutation.mutateAsync({
                  currentBalance: target,
                  expectedBalance: new BalanceDecimal(
                    account.currentBalance
                  ).toFixed(),
                  currency: account.currency,
                  idempotencyKey: submission.current.key
                })
              } catch {
                // The mutation error remains visible in the dialog, with the same retry key.
              }
            })(event)
          }}
        >
          {mutation.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to adjust balance</AlertTitle>
              <AlertDescription>{mutation.error.message}</AlertDescription>
            </Alert>
          ) : null}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="recorded-balance">
                Recorded balance ({account.currency})
              </FieldLabel>
              <Input
                id="recorded-balance"
                readOnly
                value={new BalanceDecimal(account.currentBalance).toFixed()}
                className="font-mono"
              />
            </Field>
            <Field
              data-invalid={
                Boolean(form.formState.errors.currentBalance) || undefined
              }
            >
              <FieldLabel htmlFor="new-current-balance">
                New current balance ({account.currency})
              </FieldLabel>
              <Input
                id="new-current-balance"
                inputMode="decimal"
                autoFocus
                disabled={mutation.isPending}
                className="font-mono"
                aria-invalid={
                  Boolean(form.formState.errors.currentBalance) || undefined
                }
                {...form.register("currentBalance")}
              />
              <FieldError errors={[form.formState.errors.currentBalance]} />
              <FieldDescription>
                Enter the account’s actual balance, including a minus sign if
                negative.
              </FieldDescription>
            </Field>
          </FieldGroup>
          <p className="text-sm text-muted-foreground" role="status">
            {difference ? (
              difference.isZero() ? (
                "No balance change. No transaction will be created."
              ) : (
                <>
                  Adjustment to record:{" "}
                  <span className="font-mono">
                    {difference.isPositive() ? "+" : ""}
                    {difference.toFixed()} {account.currency}
                  </span>
                </>
              )
            ) : (
              "Enter a valid balance to preview the adjustment."
            )}
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending || Boolean(difference?.isZero())}
            >
              {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
              Save balance
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
