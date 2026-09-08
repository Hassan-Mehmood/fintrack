"use client";

import { Controller, useForm, useWatch } from "react-hook-form";
import { useEffect, useMemo } from "react";
import { CircleAlertIcon, PlusIcon, SaveIcon } from "lucide-react";

import type { Account } from "@/features/accounts/account-types";
import type { Asset } from "@/features/assets/asset-types";
import type { Holding } from "@/features/investments/investment-types";
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
  FieldLegend,
  FieldSet,
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
import { Textarea } from "@/components/ui/textarea";

import {
  currencyValues,
  requiresInvestmentDetail,
  requiresManualAmount,
  requiresPrice,
  requiresQuantity,
  supportsFees,
  transactionFormSchema,
  type ParsedTransactionFormValues,
  type TransactionFormPayload,
  type TransactionFormValues,
} from "./transaction-form-schema";
import {
  addQuantities,
  calculateInvestmentTransactionAmounts,
  compareDecimals,
  divideQuantities,
  multiplyQuantities,
} from "./investment-transaction-calculations";
import {
  getInvestmentTradeType,
  isTransferType,
  transactionStatusOptions,
  transactionTypeOptions,
  emptyTransactionCategories,
  type Transaction,
  type TransactionCategories,
  type TransactionType,
} from "./transaction-types";

const cryptoTransactionTypes = new Set<TransactionType>([
  "INVESTMENT_BUY",
  "INVESTMENT_SELL",
  "INVESTMENT_SPLIT",
  "INVESTMENT_BONUS",
  "INVESTMENT_DEPOSIT",
  "INVESTMENT_WITHDRAWAL",
  "INVESTMENT_TRANSFER",
]);

interface TransactionFormDialogProps {
  readonly accounts: readonly Account[];
  readonly assets: readonly Asset[];
  readonly defaultCurrency?: (typeof currencyValues)[number];
  readonly errorMessage?: string | null;
  readonly exchangeRate?: string | null;
  readonly holdings: readonly Holding[];
  readonly categoriesByType?: TransactionCategories;
  readonly initialAccountId?: string;
  readonly initialAssetId?: string;
  readonly initialType?: TransactionType;
  readonly isPending?: boolean;
  readonly mode: "create" | "edit";
  readonly scope?: "MONEY" | "SECURITIES" | "CRYPTO";
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (payload: TransactionFormPayload) => Promise<void>;
  readonly open: boolean;
  readonly transaction?: Transaction | null;
}

export function TransactionFormDialog({
  accounts,
  assets,
  defaultCurrency = "USD",
  errorMessage,
  exchangeRate,
  holdings,
  categoriesByType = emptyTransactionCategories,
  initialAccountId,
  initialAssetId,
  initialType,
  isPending = false,
  mode,
  scope,
  onOpenChange,
  onSubmit,
  open,
  transaction,
}: TransactionFormDialogProps) {
  const form = useForm<TransactionFormValues>({
    defaultValues: getDefaultValues(
      transaction,
      defaultCurrency,
      initialAccountId,
      initialAssetId,
      initialType,
      categoriesByType[initialType ?? "EXPENSE"]?.[0],
    ),
  });

  useEffect(() => {
    if (open) {
      form.reset(
        getDefaultValues(
          transaction,
          defaultCurrency,
          initialAccountId,
          initialAssetId,
          initialType,
          categoriesByType[initialType ?? "EXPENSE"]?.[0],
        ),
      );
    }
  }, [
    categoriesByType,
    defaultCurrency,
    form,
    initialAccountId,
    initialAssetId,
    initialType,
    open,
    transaction,
  ]);

  const {
    control,
    clearErrors,
    formState: { errors },
    handleSubmit,
    register,
    setError,
    setValue,
  } = form;

  const watchedType = useWatch({ control, name: "type" });
  const watchedAccountId = useWatch({ control, name: "accountId" });
  const watchedAssetId = useWatch({
    control,
    name: "investment.assetId",
  });
  const watchedQuantity = useWatch({
    control,
    name: "investment.quantity",
  });
  const watchedPrice = useWatch({
    control,
    name: "investment.price",
  });
  const watchedFees = useWatch({
    control,
    name: "investment.fees",
  });
  const watchedSettlementAssetId = useWatch({
    control,
    name: "investment.settlementAssetId",
  });
  const showDestination = isTransferType(watchedType);
  const showInvestment =
    requiresInvestmentDetail(watchedType) || watchedType === "DIVIDEND";
  const showInvestmentQuantity = requiresQuantity(watchedType);
  const showInvestmentPrice =
    requiresPrice(watchedType) || watchedType === "INVESTMENT_DEPOSIT";
  const showInvestmentFees = supportsFees(watchedType);
  const showManualAmount = requiresManualAmount(watchedType);
  const showCalculatedAmount =
    watchedType === "INVESTMENT_BUY" ||
    watchedType === "INVESTMENT_SELL" ||
    watchedType === "INVESTMENT_REINVESTMENT";

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === watchedAccountId),
    [accounts, watchedAccountId],
  );
  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === watchedAssetId),
    [assets, watchedAssetId],
  );
  const usesStablecoinSettlement =
    selectedAccount?.type === "CRYPTO_WALLET" &&
    (watchedType === "INVESTMENT_BUY" || watchedType === "INVESTMENT_SELL");
  const selectedHolding = useMemo(
    () =>
      holdings.find(
        (holding) =>
          holding.assetId === watchedAssetId &&
          (!watchedAccountId || holding.accountId === watchedAccountId),
      ),
    [holdings, watchedAccountId, watchedAssetId],
  );
  const availableQuantity = useMemo(() => {
    const currentQuantity = selectedHolding?.quantity ?? "0";
    const editedDetail = transaction?.investmentDetail;

    if (
      mode === "edit" &&
      editedDetail &&
      editedDetail.assetId === watchedAssetId &&
      (transaction?.type === "INVESTMENT_SELL" ||
        transaction?.type === "INVESTMENT_WITHDRAWAL" ||
        transaction?.type === "INVESTMENT_TRANSFER")
    ) {
      return (
        addQuantities(currentQuantity, editedDetail.quantity) ?? currentQuantity
      );
    }

    return currentQuantity;
  }, [mode, selectedHolding, transaction, watchedAssetId]);
  const existingSplitQuantity = useMemo(() => {
    const currentQuantity = selectedHolding?.quantity ?? "0";
    const editedDetail = transaction?.investmentDetail;

    if (
      mode === "edit" &&
      transaction?.type === "INVESTMENT_SPLIT" &&
      editedDetail &&
      editedDetail.assetId === watchedAssetId
    ) {
      return (
        divideQuantities(currentQuantity, editedDetail.quantity) ??
        currentQuantity
      );
    }

    return currentQuantity;
  }, [mode, selectedHolding, transaction, watchedAssetId]);
  const investmentCalculation = useMemo(
    () =>
      showCalculatedAmount
        ? calculateInvestmentTransactionAmounts({
            type: watchedType,
            accountCurrency: usesStablecoinSettlement
              ? (selectedAsset?.priceCurrency ?? undefined)
              : selectedAccount?.currency,
            exchangeRate,
            quantity: watchedQuantity ?? "",
            price: watchedPrice ?? "",
            priceCurrency: selectedAsset?.priceCurrency ?? undefined,
            fees: watchedFees || "0",
          })
        : null,
    [
      showCalculatedAmount,
      exchangeRate,
      selectedAccount,
      selectedAsset,
      watchedFees,
      watchedPrice,
      watchedQuantity,
      watchedType,
      usesStablecoinSettlement,
    ],
  );
  const settlementAssets = useMemo(() => {
    const heldIds = new Set(
      holdings
        .filter(
          (holding) =>
            holding.accountId === watchedAccountId &&
            holding.liquidityClass === "CASH_EQUIVALENT" &&
            holding.nativeCurrency === "USD" &&
            (watchedType === "INVESTMENT_SELL" ||
              compareDecimals(holding.quantity, "0") === 1),
        )
        .map((holding) => holding.assetId),
    );
    return assets.filter(
      (asset) =>
        asset.id !== watchedAssetId &&
        asset.liquidityClass === "CASH_EQUIVALENT" &&
        asset.priceCurrency === "USD" &&
        (watchedType === "INVESTMENT_SELL" || heldIds.has(asset.id)),
    );
  }, [assets, holdings, watchedAccountId, watchedAssetId, watchedType]);
  const selectedSettlementAsset = settlementAssets.find(
    (asset) => asset.id === watchedSettlementAssetId,
  );
  const selectedSettlementSymbol =
    selectedSettlementAsset?.symbol ??
    CANONICAL_STABLECOINS.find(
      (asset) =>
        `provider:${asset.providerAssetId}` === watchedSettlementAssetId,
    )?.symbol;
  const resultingSplitQuantity = useMemo(
    () =>
      watchedType === "INVESTMENT_SPLIT"
        ? multiplyQuantities(existingSplitQuantity, watchedQuantity ?? "")
        : null,
    [existingSplitQuantity, watchedQuantity, watchedType],
  );

  useEffect(() => {
    if (selectedAccount) {
      setValue(
        "currency",
        selectedAccount.currency as (typeof currencyValues)[number],
      );
    }
  }, [selectedAccount, setValue]);

  useEffect(() => {
    if (!showDestination) {
      setValue("destinationAccountId", "");
    }
  }, [showDestination, setValue]);

  useEffect(() => {
    if (showCalculatedAmount) {
      setValue("amount", investmentCalculation?.cashImpact ?? "");
    } else if (!showManualAmount) {
      setValue("amount", "");
    }
  }, [investmentCalculation, setValue, showCalculatedAmount, showManualAmount]);

  const availableAccounts = useMemo(
    () =>
      showInvestment || watchedType === "INTEREST"
        ? accounts.filter((account) =>
            watchedType === "INVESTMENT_TRANSFER"
              ? account.type === "CRYPTO_WALLET"
              : account.type === "BROKER" || account.type === "CRYPTO_WALLET",
          )
        : accounts,
    [accounts, showInvestment, watchedType],
  );

  useEffect(() => {
    if (
      (showInvestment || watchedType === "INTEREST") &&
      selectedAccount &&
      selectedAccount.type !== "BROKER" &&
      selectedAccount.type !== "CRYPTO_WALLET"
    ) {
      setValue("accountId", "");
    }
  }, [selectedAccount, setValue, showInvestment, watchedType]);

  const otherAccounts = useMemo(
    () =>
      accounts.filter(
        (account) =>
          account.id !== watchedAccountId &&
          (watchedType === "INVESTMENT_TRANSFER"
            ? account.type === "CRYPTO_WALLET"
            : account.currency === selectedAccount?.currency),
      ),
    [accounts, selectedAccount?.currency, watchedAccountId, watchedType],
  );
  const availableAssets = useMemo(
    () =>
      watchedType === "INVESTMENT_TRANSFER"
        ? assets.filter(
            (asset) =>
              asset.liquidityClass === "CASH_EQUIVALENT" &&
              asset.priceCurrency === "USD",
          )
        : assets,
    [assets, watchedType],
  );

  useEffect(() => {
    if (
      watchedType === "INVESTMENT_DEPOSIT" &&
      selectedAsset?.liquidityClass === "CASH_EQUIVALENT" &&
      !watchedPrice
    ) {
      setValue("investment.price", "1");
    }
  }, [selectedAsset?.liquidityClass, setValue, watchedPrice, watchedType]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
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
            clearErrors();

            const parsedValues = transactionFormSchema.safeParse(values);

            if (!parsedValues.success) {
              parsedValues.error.issues.forEach((issue) => {
                const fieldName = issue.path[0];

                if (typeof fieldName === "string") {
                  setError(fieldName as keyof TransactionFormValues, {
                    message: issue.message,
                  });
                }
              });

              return;
            }

            if (
              (parsedValues.data.type === "INVESTMENT_SELL" ||
                parsedValues.data.type === "INVESTMENT_WITHDRAWAL" ||
                parsedValues.data.type === "INVESTMENT_TRANSFER") &&
              compareDecimals(
                parsedValues.data.investment?.quantity ?? "",
                availableQuantity,
              ) === 1
            ) {
              setError("investment.quantity", {
                message: `Quantity cannot exceed the current holding (${availableQuantity}).`,
              });
              return;
            }

            if (
              usesStablecoinSettlement &&
              !parsedValues.data.investment?.settlementAssetId
            ) {
              setError("investment.settlementAssetId", {
                message:
                  watchedType === "INVESTMENT_BUY"
                    ? "Select the stablecoin used to pay for this purchase."
                    : "Select the stablecoin that received the sale proceeds.",
              });
              return;
            }

            await onSubmit(sanitizePayload(parsedValues.data));
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
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      const selectedType = transactionTypeOptions.find(
                        (option) => option.value === value,
                      )?.value;

                      if (!selectedType) {
                        return;
                      }

                      field.onChange(selectedType);
                      setValue("category", "", { shouldValidate: false });
                      setValue(
                        "investment",
                        getEmptyInvestmentValues(selectedType),
                        { shouldValidate: false },
                      );
                      setValue("amount", "", { shouldValidate: false });
                    }}
                  >
                    <SelectTrigger
                      id="transaction-type"
                      aria-invalid={Boolean(errors.type) || undefined}
                      className="w-full"
                    >
                      <SelectValue placeholder="Select a type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {transactionTypeOptions.filter((option) =>
                          scope === "MONEY"
                            ? !option.value.startsWith("INVESTMENT_") && option.value !== "DIVIDEND" && option.value !== "INTEREST"
                            : scope === "CRYPTO"
                              ? cryptoTransactionTypes.has(option.value)
                              : scope === "SECURITIES"
                                ? option.value === "TRANSFER" || option.value.startsWith("INVESTMENT_") || option.value === "DIVIDEND" || option.value === "INTEREST"
                                : true,
                        ).map((option) => (
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

            <Field data-invalid={Boolean(errors.status) || undefined}>
              <FieldLabel htmlFor="transaction-status">Status</FieldLabel>
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger
                      id="transaction-status"
                      aria-invalid={Boolean(errors.status) || undefined}
                      className="w-full"
                    >
                      <SelectValue placeholder="Select a status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {transactionStatusOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldDescription>
                Only cleared transactions affect balances and summaries.
              </FieldDescription>
              <FieldError errors={[errors.status]} />
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
                    <Select value={field.value} onValueChange={field.onChange}>
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
                  {watchedType === "INVESTMENT_TRANSFER"
                    ? "The stablecoin quantity and proportional cost basis will move here."
                    : "Money will leave the selected account and move here."}
                </FieldDescription>
                <FieldError errors={[errors.destinationAccountId]} />
              </Field>
            ) : null}

            {showManualAmount ? (
              <Field data-invalid={Boolean(errors.amount) || undefined}>
                <FieldLabel htmlFor="transaction-amount">Amount</FieldLabel>
                <Input
                  id="transaction-amount"
                  aria-invalid={Boolean(errors.amount) || undefined}
                  inputMode="decimal"
                  placeholder="0.00"
                  {...register("amount")}
                />
                <FieldDescription>
                  {watchedType === "ADJUSTMENT"
                    ? `Use a negative value to reduce the account balance. ${selectedAccount?.currency ?? ""}`
                    : `Enter the amount in ${selectedAccount?.currency ?? "the account currency"}.`}
                </FieldDescription>
                <FieldError errors={[errors.amount]} />
              </Field>
            ) : null}

            {showCalculatedAmount ? (
              <CalculatedAmountField
                currency={
                  usesStablecoinSettlement
                    ? (selectedSettlementSymbol ?? "stablecoin")
                    : selectedAccount?.currency
                }
                label={
                  watchedType === "INVESTMENT_SELL"
                    ? usesStablecoinSettlement
                      ? "Stablecoin received"
                      : "Net proceeds"
                    : watchedType === "INVESTMENT_REINVESTMENT"
                      ? "Total used"
                      : usesStablecoinSettlement
                        ? "Stablecoin required"
                        : "Total amount"
                }
                value={investmentCalculation?.cashImpact ?? ""}
              />
            ) : null}

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
            <FieldSet className="rounded-lg border bg-card p-4">
              <FieldLegend>Investment details</FieldLegend>
              <FieldGroup className="grid gap-5 md:grid-cols-2">
                <Field
                  data-invalid={
                    Boolean(errors.investment?.assetId) || undefined
                  }
                >
                  <FieldLabel htmlFor="transaction-investment-asset">
                    Asset
                  </FieldLabel>
                  <Controller
                    control={control}
                    name="investment.assetId"
                    render={({ field }) => (
                      <Select
                        value={
                          watchedType === "DIVIDEND" && !field.value
                            ? "none"
                            : (field.value ?? "")
                        }
                        onValueChange={(value) =>
                          field.onChange(value === "none" ? "" : value)
                        }
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
                            {watchedType === "DIVIDEND" ? (
                              <SelectItem value="none">
                                No related asset
                              </SelectItem>
                            ) : null}
                            {availableAssets.length === 0 ? (
                              <SelectItem value="unavailable" disabled>
                                No assets available
                              </SelectItem>
                            ) : null}
                            {availableAssets.map((asset) => (
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
                  {watchedType === "DIVIDEND" ? (
                    <FieldDescription>
                      Optional. Link this dividend to a holding when applicable.
                    </FieldDescription>
                  ) : null}
                  <FieldError errors={[errors.investment?.assetId]} />
                </Field>

                {showInvestmentQuantity ? (
                  <Field
                    data-invalid={
                      Boolean(errors.investment?.quantity) || undefined
                    }
                  >
                    <FieldLabel htmlFor="transaction-investment-quantity">
                      {watchedType === "INVESTMENT_SPLIT"
                        ? "Split ratio"
                        : watchedType === "INVESTMENT_BONUS"
                          ? "Number of bonus shares"
                          : "Quantity"}
                    </FieldLabel>
                    <Input
                      id="transaction-investment-quantity"
                      aria-invalid={
                        Boolean(errors.investment?.quantity) || undefined
                      }
                      inputMode="decimal"
                      placeholder={
                        watchedType === "INVESTMENT_SPLIT" ? "2" : "0.015"
                      }
                      {...register("investment.quantity")}
                    />
                    <FieldDescription>
                      {watchedType === "INVESTMENT_SPLIT"
                        ? "Enter the new-for-old multiplier, such as 2 for a 2-for-1 split."
                        : watchedType === "INVESTMENT_SELL" ||
                            watchedType === "INVESTMENT_WITHDRAWAL" ||
                            watchedType === "INVESTMENT_TRANSFER"
                          ? `Currently available: ${availableQuantity}`
                          : "Fractional shares and cryptocurrency quantities are supported."}
                    </FieldDescription>
                    <FieldError errors={[errors.investment?.quantity]} />
                  </Field>
                ) : null}

                {showInvestmentPrice ? (
                  <Field
                    data-invalid={
                      Boolean(errors.investment?.price) || undefined
                    }
                  >
                    <FieldLabel htmlFor="transaction-investment-price">
                      {watchedType === "INVESTMENT_DEPOSIT"
                        ? "Cost per unit"
                        : "Price per unit"}
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
                    <FieldDescription>
                      {watchedType === "INVESTMENT_DEPOSIT"
                        ? "Defaults to USD 1 for stablecoins. Enter the actual acquisition cost in "
                        : "Price in "}
                      {selectedAsset?.priceCurrency ?? "asset price currency"}.
                    </FieldDescription>
                    <FieldError errors={[errors.investment?.price]} />
                  </Field>
                ) : null}

                {showInvestmentFees ? (
                  <Field
                    data-invalid={Boolean(errors.investment?.fees) || undefined}
                  >
                    <FieldLabel htmlFor="transaction-investment-fees">
                      Fees
                    </FieldLabel>
                    <Input
                      id="transaction-investment-fees"
                      aria-invalid={
                        Boolean(errors.investment?.fees) || undefined
                      }
                      inputMode="decimal"
                      placeholder="0"
                      {...register("investment.fees")}
                    />
                    <FieldDescription>
                      Fees in{" "}
                      {usesStablecoinSettlement
                        ? (selectedSettlementSymbol ??
                          "the selected stablecoin")
                        : (selectedAccount?.currency ?? "account currency")}
                      .
                    </FieldDescription>
                    <FieldError errors={[errors.investment?.fees]} />
                  </Field>
                ) : null}

                {usesStablecoinSettlement ? (
                  <Field
                    data-invalid={
                      Boolean(errors.investment?.settlementAssetId) || undefined
                    }
                  >
                    <FieldLabel htmlFor="transaction-settlement-asset">
                      {watchedType === "INVESTMENT_BUY"
                        ? "Pay with"
                        : "Receive in"}
                    </FieldLabel>
                    <Controller
                      control={control}
                      name="investment.settlementAssetId"
                      render={({ field }) => (
                        <Select
                          value={field.value ?? ""}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger id="transaction-settlement-asset">
                            <SelectValue placeholder="Select a stablecoin" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {settlementAssets.map((asset) => {
                                const holding = holdings.find(
                                  (item) =>
                                    item.accountId === watchedAccountId &&
                                    item.assetId === asset.id,
                                );
                                return (
                                  <SelectItem key={asset.id} value={asset.id}>
                                    {asset.symbol ?? asset.name}
                                    {holding
                                      ? ` · ${holding.quantity} available`
                                      : " · new balance"}
                                  </SelectItem>
                                );
                              })}
                              {watchedType === "INVESTMENT_SELL"
                                ? CANONICAL_STABLECOINS.filter(
                                    (candidate) =>
                                      !assets.some(
                                        (asset) =>
                                          asset.provider === "COINGECKO" &&
                                          asset.providerAssetId ===
                                            candidate.providerAssetId,
                                      ),
                                  ).map((candidate) => (
                                    <SelectItem
                                      key={candidate.providerAssetId}
                                      value={`provider:${candidate.providerAssetId}`}
                                    >
                                      {candidate.symbol} · create new balance
                                    </SelectItem>
                                  ))
                                : null}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      )}
                    />
                    <FieldDescription>
                      {selectedAsset && selectedSettlementSymbol
                        ? `Pair: ${selectedAsset.symbol ?? selectedAsset.name}/${selectedSettlementSymbol}`
                        : watchedType === "INVESTMENT_BUY"
                          ? "Only positive cash-equivalent balances in this wallet are available."
                          : "Sale proceeds create or increase this cash-equivalent holding."}
                    </FieldDescription>
                    <FieldError
                      errors={[errors.investment?.settlementAssetId]}
                    />
                  </Field>
                ) : watchedType === "INVESTMENT_BUY" ||
                  watchedType === "INVESTMENT_SELL" ? (
                  <Field>
                    <FieldLabel>
                      {watchedType === "INVESTMENT_BUY"
                        ? "Paid with"
                        : "Receive as"}
                    </FieldLabel>
                    <Input
                      readOnly
                      value={`Cash (${selectedAccount?.currency ?? ""})`}
                    />
                    <FieldDescription>
                      Available broker cash:{" "}
                      {selectedAccount?.currentBalance ?? "0"}{" "}
                      {selectedAccount?.currency ?? ""}
                    </FieldDescription>
                  </Field>
                ) : null}

                {showCalculatedAmount ? (
                  <CalculatedAmountField
                    currency={selectedAsset?.priceCurrency ?? undefined}
                    label={
                      watchedType === "INVESTMENT_REINVESTMENT"
                        ? "Reinvested amount"
                        : "Gross amount"
                    }
                    value={investmentCalculation?.grossAmount ?? ""}
                  />
                ) : null}

                {showCalculatedAmount &&
                selectedAsset?.priceCurrency &&
                selectedAccount?.currency !== selectedAsset.priceCurrency ? (
                  <CalculatedAmountField
                    currency={selectedAccount?.currency}
                    label="Account cash impact"
                    value={investmentCalculation?.cashImpact ?? ""}
                  />
                ) : null}

                {watchedType === "INVESTMENT_SPLIT" ? (
                  <>
                    <CalculatedQuantityField
                      label="Existing quantity"
                      value={existingSplitQuantity}
                    />
                    <CalculatedQuantityField
                      label="Resulting quantity"
                      value={resultingSplitQuantity ?? ""}
                    />
                  </>
                ) : null}
              </FieldGroup>
            </FieldSet>
          ) : null}

          <FieldGroup className="grid gap-5 md:grid-cols-2">
            <Field data-invalid={Boolean(errors.category) || undefined}>
              <FieldLabel htmlFor="transaction-category">Category</FieldLabel>
              <Controller
                control={control}
                name="category"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger
                      id="transaction-category"
                      aria-invalid={Boolean(errors.category) || undefined}
                      className="w-full"
                    >
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {categoriesByType[watchedType].map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[errors.category]} />
            </Field>

            <Field data-invalid={Boolean(errors.description) || undefined}>
              <FieldLabel htmlFor="transaction-description">
                Description (optional)
              </FieldLabel>
              <Input
                id="transaction-description"
                aria-invalid={Boolean(errors.description) || undefined}
                placeholder="Grocery shopping, monthly salary..."
                {...register("description")}
              />
              <FieldError errors={[errors.description]} />
            </Field>
          </FieldGroup>

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
              <Textarea
                id="transaction-notes"
                aria-invalid={Boolean(errors.notes) || undefined}
                placeholder="Optional"
                {...register("notes")}
              />
              <FieldError errors={[errors.notes]} />
            </Field>

            <Field data-invalid={Boolean(errors.reference) || undefined}>
              <FieldLabel htmlFor="transaction-reference">Reference</FieldLabel>
              <Input
                id="transaction-reference"
                aria-invalid={Boolean(errors.reference) || undefined}
                placeholder="Optional bank or broker reference"
                {...register("reference")}
              />
              <FieldError errors={[errors.reference]} />
            </Field>

            <Field data-invalid={Boolean(errors.labels) || undefined}>
              <FieldLabel htmlFor="transaction-labels">Labels</FieldLabel>
              <Input
                id="transaction-labels"
                aria-invalid={Boolean(errors.labels) || undefined}
                placeholder="work, recurring, reimbursable"
                {...register("labels")}
              />
              <FieldDescription>
                Separate labels with commas. Up to 20 labels are stored.
              </FieldDescription>
              <FieldError errors={[errors.labels]} />
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
  );
}

function getDefaultValues(
  transaction: Transaction | null | undefined,
  defaultCurrency: (typeof currencyValues)[number],
  initialAccountId?: string,
  initialAssetId?: string,
  initialType: TransactionType = "EXPENSE",
  initialCategory = "",
): TransactionFormValues {
  if (!transaction) {
    const investment = getEmptyInvestmentValues(initialType);
    return {
      type: initialType,
      status: "CLEARED",
      accountId: initialAccountId ?? "",
      destinationAccountId: "",
      amount: "",
      currency: defaultCurrency,
      occurredAt: new Date().toISOString().slice(0, 10),
      category: initialCategory,
      description: "",
      merchant: "",
      notes: "",
      reference: "",
      labels: "",
      investment: investment
        ? { ...investment, assetId: initialAssetId ?? "" }
        : undefined,
    };
  }

  return {
    type: transaction.type,
    status: transaction.status,
    accountId: transaction.accountId,
    destinationAccountId: transaction.destinationAccountId ?? "",
    amount: transaction.amount,
    currency: transaction.currency as (typeof currencyValues)[number],
    occurredAt: transaction.occurredAt.slice(0, 10),
    category: transaction.category,
    description: transaction.description,
    merchant: transaction.merchant ?? "",
    notes: transaction.notes ?? "",
    reference: transaction.reference ?? "",
    labels: transaction.labels.join(", "),
    investment:
      transaction.investmentDetail &&
      (requiresInvestmentDetail(transaction.type) ||
        transaction.type === "DIVIDEND")
        ? {
            assetId: transaction.investmentDetail.assetId,
            tradeType: getInvestmentTradeType(transaction.type) ?? undefined,
            quantity: requiresQuantity(transaction.type)
              ? transaction.investmentDetail.quantity
              : "",
            price:
              requiresPrice(transaction.type) ||
              transaction.type === "INVESTMENT_DEPOSIT"
                ? transaction.investmentDetail.price
                : "",
            fees: supportsFees(transaction.type)
              ? transaction.investmentDetail.fees
              : "",
            notes: "",
            settlementAssetId:
              transaction.investmentDetail.settlementAssetId ?? "",
          }
        : getEmptyInvestmentValues(transaction.type),
  };
}

function getEmptyInvestmentValues(
  type: TransactionType,
): TransactionFormValues["investment"] {
  const tradeType = getInvestmentTradeType(type);

  if (!tradeType || tradeType === "INTEREST") {
    return undefined;
  }

  return {
    assetId: "",
    tradeType,
    quantity: "",
    price: "",
    fees: "",
    notes: "",
    settlementAssetId: "",
  };
}

function sanitizePayload(
  values: ParsedTransactionFormValues,
): TransactionFormPayload {
  const shouldIncludeInvestment =
    requiresInvestmentDetail(values.type) ||
    (values.type === "DIVIDEND" && Boolean(values.investment?.assetId));
  const tradeType = getInvestmentTradeType(values.type);
  const investment =
    shouldIncludeInvestment &&
    values.investment?.assetId &&
    tradeType &&
    tradeType !== "INTEREST"
      ? {
          assetId: values.investment.assetId,
          tradeType,
          quantity: requiresQuantity(values.type)
            ? values.investment.quantity
            : undefined,
          price:
            requiresPrice(values.type) || values.type === "INVESTMENT_DEPOSIT"
              ? values.investment.price
              : undefined,
          fees: supportsFees(values.type)
            ? values.investment.fees || "0"
            : undefined,
          notes: undefined,
          settlementAsset: values.investment.settlementAssetId
            ? values.investment.settlementAssetId.startsWith("provider:")
              ? {
                  kind: "PROVIDER" as const,
                  provider: "COINGECKO" as const,
                  providerAssetId: values.investment.settlementAssetId.slice(
                    "provider:".length,
                  ),
                }
              : {
                  kind: "EXISTING" as const,
                  assetId: values.investment.settlementAssetId,
                }
            : undefined,
        }
      : values.type === "DIVIDEND"
        ? null
        : undefined;

  return {
    ...values,
    labels: values.labels
      ? [...new Set(values.labels.split(",").map((label) => label.trim()))]
          .filter(Boolean)
          .slice(0, 20)
      : [],
    destinationAccountId: isTransferType(values.type)
      ? values.destinationAccountId
      : undefined,
    amount:
      requiresManualAmount(values.type) ||
      values.type === "INVESTMENT_BUY" ||
      values.type === "INVESTMENT_SELL" ||
      values.type === "INVESTMENT_REINVESTMENT"
        ? values.amount
        : undefined,
    investment,
  };
}

const CANONICAL_STABLECOINS = [
  { providerAssetId: "tether", symbol: "USDT" },
  { providerAssetId: "usd-coin", symbol: "USDC" },
  { providerAssetId: "dai", symbol: "DAI" },
] as const;

function CalculatedAmountField({
  currency,
  label,
  value,
}: {
  readonly currency?: string;
  readonly label: string;
  readonly value: string;
}) {
  const inputId = `transaction-${label.toLowerCase().replaceAll(" ", "-")}`;

  return (
    <Field data-disabled>
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <Input
        id={inputId}
        readOnly
        aria-readonly="true"
        value={value}
        placeholder="Calculated automatically"
      />
      <FieldDescription>
        {currency
          ? `${currency} · calculated automatically`
          : "Calculated automatically after selecting an account."}
      </FieldDescription>
    </Field>
  );
}

function CalculatedQuantityField({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  const inputId = `transaction-${label.toLowerCase().replaceAll(" ", "-")}`;

  return (
    <Field data-disabled>
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <Input id={inputId} readOnly aria-readonly="true" value={value} />
    </Field>
  );
}
