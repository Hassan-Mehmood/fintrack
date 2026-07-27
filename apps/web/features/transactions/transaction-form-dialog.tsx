"use client"

import { Controller, useForm, useWatch } from "react-hook-form"
import { useEffect, useMemo } from "react"
import { CircleAlertIcon, PlusIcon, SaveIcon } from "lucide-react"

import type { Account } from "@/features/accounts/account-types"
import type { Asset } from "@/features/assets/asset-types"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"

import {
  currencyValues,
  transactionFormSchema,
  type TransactionFormPayload,
  type TransactionFormValues,
} from "./transaction-form-schema"
import {
  getInvestmentTradeType,
  isInvestmentType,
  isTransferType,
  transactionTypeOptions,
  type Transaction,
} from "./transaction-types"

interface TransactionFormDialogProps {
  readonly accounts: readonly Account[]
  readonly assets: readonly Asset[]
  readonly defaultCurrency?: (typeof currencyValues)[number]
  readonly errorMessage?: string | null
  readonly isPending?: boolean
  readonly mode: "create" | "edit"
  readonly onOpenChange: (open: boolean) => void
  readonly onSubmit: (payload: TransactionFormPayload) => Promise<void>
  readonly open: boolean
  readonly transaction?: Transaction | null
}

export function TransactionFormDialog({
  accounts,
  assets,
  defaultCurrency = "USD",
  errorMessage,
  isPending = false,
  mode,
  onOpenChange,
  onSubmit,
  open,
  transaction,
}: TransactionFormDialogProps) {
  const form = useForm<TransactionFormValues>({
    defaultValues: getDefaultValues(transaction, defaultCurrency),
  })

  useEffect(() => {
    if (open) {
      form.reset(getDefaultValues(transaction, defaultCurrency))
    }
  }, [defaultCurrency, form, open, transaction])

  const {
    control,
    clearErrors,
    formState: { errors },
    handleSubmit,
    register,
    setError,
    setValue,
  } = form

  const watchedType = useWatch({ control, name: "type" })
  const watchedAccountId = useWatch({ control, name: "accountId" })
  const watchedInvestmentTradeType = useWatch({
    control,
    name: "investment.tradeType",
  })
  const showDestination = isTransferType(watchedType)
  const showInvestment = isInvestmentType(watchedType)
  const showInvestmentQuantity =
    watchedInvestmentTradeType === "BUY" ||
    watchedInvestmentTradeType === "SELL" ||
    watchedInvestmentTradeType === "REINVESTMENT" ||
    watchedInvestmentTradeType === "DEPOSIT" ||
    watchedInvestmentTradeType === "WITHDRAWAL" ||
    watchedInvestmentTradeType === "SPLIT" ||
    watchedInvestmentTradeType === "BONUS"
  const showInvestmentPrice =
    watchedInvestmentTradeType === "BUY" ||
    watchedInvestmentTradeType === "SELL" ||
    watchedInvestmentTradeType === "REINVESTMENT" ||
    watchedInvestmentTradeType === "DEPOSIT" ||
    watchedInvestmentTradeType === "WITHDRAWAL"

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === watchedAccountId),
    [accounts, watchedAccountId]
  )

  useEffect(() => {
    if (selectedAccount) {
      setValue(
        "currency",
        selectedAccount.currency as (typeof currencyValues)[number]
      )
    }
  }, [selectedAccount, setValue])

  useEffect(() => {
    if (!showDestination) {
      setValue("destinationAccountId", "")
    }
  }, [showDestination, setValue])

  useEffect(() => {
    const tradeType = getInvestmentTradeType(watchedType)

    if (tradeType) {
      setValue("investment.tradeType", tradeType)

      if (
        tradeType === "DIVIDEND" ||
        tradeType === "INTEREST" ||
        tradeType === "SPLIT" ||
        tradeType === "BONUS"
      ) {
        setValue("investment.quantity", "0")
        setValue("investment.price", "0")
      }
    }
  }, [watchedType, setValue])

  useEffect(() => {
    if (
      watchedType === "INVESTMENT_DEPOSIT" ||
      watchedType === "INVESTMENT_WITHDRAWAL"
    ) {
      setValue("amount", "0")
    }
  }, [watchedType, setValue])

  const availableAccounts = useMemo(
    () =>
      showInvestment
        ? accounts.filter(
            (account) =>
              account.type === "BROKER" || account.type === "CRYPTO_WALLET"
          )
        : accounts,
    [accounts, showInvestment]
  )

  useEffect(() => {
    if (
      showInvestment &&
      selectedAccount &&
      selectedAccount.type !== "BROKER" &&
      selectedAccount.type !== "CRYPTO_WALLET"
    ) {
      setValue("accountId", "")
    }
  }, [selectedAccount, setValue, showInvestment])

  const otherAccounts = useMemo(
    () => accounts.filter((account) => account.id !== watchedAccountId),
    [accounts, watchedAccountId]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Add transaction" : "Edit transaction"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Record income, expenses, transfers, and other account activity."
              : "Update the transaction details."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(async (values) => {
            clearErrors()

            const parsedValues = transactionFormSchema.safeParse(values)

            if (!parsedValues.success) {
              parsedValues.error.issues.forEach((issue) => {
                const fieldName = issue.path[0]

                if (typeof fieldName === "string") {
                  setError(fieldName as keyof TransactionFormValues, {
                    message: issue.message,
                  })
                }
              })

              return
            }

            await onSubmit(parsedValues.data)
          })}
          className="flex flex-col gap-4"
        >
          {errorMessage ? (
            <Alert variant="destructive">
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>Request failed</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}

          <FieldGroup className="grid gap-5 md:grid-cols-2">
            <Field data-invalid={Boolean(errors.type) || undefined}>
              <FieldLabel htmlFor="transaction-type">Type</FieldLabel>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger
                      id="transaction-type"
                      aria-invalid={Boolean(errors.type) || undefined}
                      className="w-full"
                    >
                      <SelectValue placeholder="Select a type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {transactionTypeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[errors.type]} />
            </Field>

            <Field data-invalid={Boolean(errors.accountId) || undefined}>
              <FieldLabel htmlFor="transaction-account">Account</FieldLabel>
              <Controller
                control={control}
                name="accountId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger
                      id="transaction-account"
                      aria-invalid={Boolean(errors.accountId) || undefined}
                      className="w-full"
                    >
                      <SelectValue placeholder="Select an account" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {availableAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name} ({account.currency})
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[errors.accountId]} />
              {selectedAccount ? (
                <FieldDescription>
                  Selected account: {selectedAccount.name} (
                  {selectedAccount.currency})
                </FieldDescription>
              ) : null}
            </Field>

            {showDestination ? (
              <Field
                data-invalid={Boolean(errors.destinationAccountId) || undefined}
              >
                <FieldLabel htmlFor="transaction-destination">
                  To account
                </FieldLabel>
                <Controller
                  control={control}
                  name="destinationAccountId"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger
                        id="transaction-destination"
                        aria-invalid={
                          Boolean(errors.destinationAccountId) || undefined
                        }
                        className="w-full"
                      >
                        <SelectValue placeholder="Select destination account" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {otherAccounts.length === 0 ? (
                            <SelectItem value="" disabled>
                              No other accounts available
                            </SelectItem>
                          ) : null}
                          {otherAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.name} ({account.currency})
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldDescription>
                  Money will leave the selected account and move here.
                </FieldDescription>
                <FieldError errors={[errors.destinationAccountId]} />
              </Field>
            ) : null}

            <Field
              data-disabled={
                watchedType === "INVESTMENT_DEPOSIT" ||
                watchedType === "INVESTMENT_WITHDRAWAL" ||
                undefined
              }
              data-invalid={Boolean(errors.amount) || undefined}
            >
              <FieldLabel htmlFor="transaction-amount">Amount</FieldLabel>
              <Input
                id="transaction-amount"
                aria-invalid={Boolean(errors.amount) || undefined}
                inputMode="decimal"
                placeholder="0.00"
                disabled={
                  watchedType === "INVESTMENT_DEPOSIT" ||
                  watchedType === "INVESTMENT_WITHDRAWAL"
                }
                {...register("amount")}
              />
              <FieldDescription>
                {watchedType === "INVESTMENT_DEPOSIT" ||
                watchedType === "INVESTMENT_WITHDRAWAL"
                  ? "Asset movements do not change the account cash balance."
                  : watchedType === "ADJUSTMENT"
                  ? "Use a negative value to reduce the account balance."
                  : "Enter the absolute amount. The type determines whether it is added or deducted."}
              </FieldDescription>
              <FieldError errors={[errors.amount]} />
            </Field>

            <Field data-invalid={Boolean(errors.currency) || undefined}>
              <FieldLabel htmlFor="transaction-currency">Currency</FieldLabel>
              <Controller
                control={control}
                name="currency"
                render={({ field }) => (
                  <Input
                    id="transaction-currency"
                    readOnly
                    aria-readonly="true"
                    aria-invalid={Boolean(errors.currency) || undefined}
                    placeholder={
                      selectedAccount
                        ? selectedAccount.currency
                        : "Select an account first"
                    }
                    {...field}
                  />
                )}
              />
              <FieldDescription>
                Currency is set automatically by the selected account.
              </FieldDescription>
              <FieldError errors={[errors.currency]} />
            </Field>

            <Field data-invalid={Boolean(errors.occurredAt) || undefined}>
              <FieldLabel htmlFor="transaction-occurred-at">Date</FieldLabel>
              <Input
                id="transaction-occurred-at"
                aria-invalid={Boolean(errors.occurredAt) || undefined}
                type="date"
                {...register("occurredAt")}
              />
              <FieldError errors={[errors.occurredAt]} />
            </Field>
          </FieldGroup>

          {showInvestment ? (
            <div className="rounded-lg border bg-card p-4">
              <p className="mb-4 text-sm font-medium">Investment details</p>
              <FieldGroup className="grid gap-5 md:grid-cols-2">
                <Field
                  data-invalid={Boolean(errors.investment?.assetId) || undefined}
                >
                  <FieldLabel htmlFor="transaction-investment-asset">
                    Asset
                  </FieldLabel>
                  <Controller
                    control={control}
                    name="investment.assetId"
                    render={({ field }) => (
                      <Select
                        value={field.value ?? ""}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger
                          id="transaction-investment-asset"
                          aria-invalid={
                            Boolean(errors.investment?.assetId) || undefined
                          }
                          className="w-full"
                        >
                          <SelectValue placeholder="Select an asset" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {assets.length === 0 ? (
                              <SelectItem value="" disabled>
                                No assets available
                              </SelectItem>
                            ) : null}
                            {assets.map((asset) => (
                              <SelectItem key={asset.id} value={asset.id}>
                                {asset.name}
                                {asset.symbol ? ` (${asset.symbol})` : null}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[errors.investment?.assetId]} />
                </Field>

                {showInvestmentQuantity ? (
                  <Field
                    data-invalid={
                      Boolean(errors.investment?.quantity) || undefined
                    }
                  >
                    <FieldLabel htmlFor="transaction-investment-quantity">
                      {watchedInvestmentTradeType === "SPLIT"
                        ? "Split ratio"
                        : watchedInvestmentTradeType === "BONUS"
                          ? "Bonus shares"
                          : "Quantity"}
                    </FieldLabel>
                    <Input
                      id="transaction-investment-quantity"
                      aria-invalid={
                        Boolean(errors.investment?.quantity) || undefined
                      }
                      inputMode="decimal"
                      placeholder={
                        watchedInvestmentTradeType === "SPLIT" ? "2" : "0.015"
                      }
                      {...register("investment.quantity")}
                    />
                    <FieldError errors={[errors.investment?.quantity]} />
                  </Field>
                ) : null}

                {showInvestmentPrice ? (
                  <Field
                    data-invalid={Boolean(errors.investment?.price) || undefined}
                  >
                    <FieldLabel htmlFor="transaction-investment-price">
                      Price per unit
                    </FieldLabel>
                    <Input
                      id="transaction-investment-price"
                      aria-invalid={
                        Boolean(errors.investment?.price) || undefined
                      }
                      inputMode="decimal"
                      placeholder="67000"
                      {...register("investment.price")}
                    />
                    <FieldError errors={[errors.investment?.price]} />
                  </Field>
                ) : null}

                {showInvestmentPrice ? (
                  <Field
                    data-invalid={Boolean(errors.investment?.fees) || undefined}
                  >
                    <FieldLabel htmlFor="transaction-investment-fees">
                      Fees
                    </FieldLabel>
                    <Input
                      id="transaction-investment-fees"
                      aria-invalid={Boolean(errors.investment?.fees) || undefined}
                      inputMode="decimal"
                      placeholder="0"
                      {...register("investment.fees")}
                  />
                  <FieldError errors={[errors.investment?.fees]} />
                </Field>
                ) : null}

                <Field
                  data-invalid={Boolean(errors.investment?.notes) || undefined}
                >
                  <FieldLabel htmlFor="transaction-investment-notes">
                    Investment notes
                  </FieldLabel>
                  <Input
                    id="transaction-investment-notes"
                    aria-invalid={
                      Boolean(errors.investment?.notes) || undefined
                    }
                    placeholder="Optional"
                    {...register("investment.notes")}
                  />
                  <FieldError errors={[errors.investment?.notes]} />
                </Field>
              </FieldGroup>
            </div>
          ) : null}

          <Field data-invalid={Boolean(errors.description) || undefined}>
            <FieldLabel htmlFor="transaction-description">
              Description
            </FieldLabel>
            <Input
              id="transaction-description"
              aria-invalid={Boolean(errors.description) || undefined}
              placeholder="Grocery shopping, salary, transfer to savings..."
              {...register("description")}
            />
            <FieldError errors={[errors.description]} />
          </Field>

          <FieldGroup className="grid gap-5 md:grid-cols-2">
            <Field data-invalid={Boolean(errors.merchant) || undefined}>
              <FieldLabel htmlFor="transaction-merchant">Merchant</FieldLabel>
              <Input
                id="transaction-merchant"
                aria-invalid={Boolean(errors.merchant) || undefined}
                placeholder="Optional"
                {...register("merchant")}
              />
              <FieldError errors={[errors.merchant]} />
            </Field>

            <Field data-invalid={Boolean(errors.notes) || undefined}>
              <FieldLabel htmlFor="transaction-notes">Notes</FieldLabel>
              <Input
                id="transaction-notes"
                aria-invalid={Boolean(errors.notes) || undefined}
                placeholder="Optional"
                {...register("notes")}
              />
              <FieldError errors={[errors.notes]} />
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <Spinner data-icon="inline-start" />
              ) : mode === "create" ? (
                <PlusIcon data-icon="inline-start" />
              ) : (
                <SaveIcon data-icon="inline-start" />
              )}
              {mode === "create" ? "Create transaction" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function getDefaultValues(
  transaction: Transaction | null | undefined,
  defaultCurrency: (typeof currencyValues)[number]
): TransactionFormValues {
  if (!transaction) {
    return {
      type: "EXPENSE",
      accountId: "",
      destinationAccountId: "",
      amount: "",
      currency: defaultCurrency,
      occurredAt: new Date().toISOString().slice(0, 10),
      description: "",
      merchant: "",
      notes: "",
      investment: {
        assetId: "",
        tradeType: "BUY",
        quantity: "",
        price: "",
        fees: "",
        notes: "",
      },
    }
  }

  return {
    type: transaction.type,
    accountId: transaction.accountId,
    destinationAccountId: transaction.destinationAccountId ?? "",
    amount: transaction.amount,
    currency: transaction.currency as (typeof currencyValues)[number],
    occurredAt: transaction.occurredAt.slice(0, 10),
    description: transaction.description,
    merchant: transaction.merchant ?? "",
    notes: transaction.notes ?? "",
    investment: transaction.investmentDetail
      ? {
          assetId: transaction.investmentDetail.assetId,
          tradeType: transaction.investmentDetail.tradeType,
          quantity: transaction.investmentDetail.quantity,
          price: transaction.investmentDetail.price,
          fees: transaction.investmentDetail.fees,
          notes: transaction.investmentDetail.notes ?? "",
        }
      : undefined,
  }
}
