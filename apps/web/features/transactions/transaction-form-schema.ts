import { z } from "zod/v4"

import {
  calculateInvestmentTransactionAmounts,
  compareDecimals,
  isNonNegativeDecimal,
  isPositiveDecimal,
} from "./investment-transaction-calculations"
import {
  getInvestmentTradeType,
  transactionTypeValues,
  type TransactionType,
  type TransactionPayload,
} from "./transaction-types"

const signedAmountPattern = /^(?:-)?(?:0|[1-9]\d*)(?:\.\d{1,8})?$/
const decimalField = z.string().trim().optional().or(z.literal(""))

export const currencyValues = ["USD", "PKR"] as const

const investmentSchema = z.object({
  assetId: z.string().trim().optional().or(z.literal("")),
  tradeType: z
    .enum([
      "BUY",
      "SELL",
      "DIVIDEND",
      "INTEREST",
      "SPLIT",
      "BONUS",
      "REINVESTMENT",
      "DEPOSIT",
      "WITHDRAWAL",
    ])
    .optional(),
  quantity: decimalField,
  price: decimalField,
  fees: decimalField,
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
})

export const transactionFormSchema = z
  .object({
    type: z.enum(transactionTypeValues, {
      error: "Select a transaction type.",
    }),
    accountId: z.string().uuid("Select an account."),
    destinationAccountId: z.string().uuid().optional().or(z.literal("")),
    amount: decimalField,
    currency: z.enum(currencyValues, {
      error: "Select a currency.",
    }),
    occurredAt: z.string().trim().min(1, "Select a date."),
    description: z
      .string()
      .trim()
      .min(1, "Enter a description.")
      .max(255),
    merchant: z.string().trim().max(120).optional().or(z.literal("")),
    notes: z.string().trim().max(1000).optional().or(z.literal("")),
    investment: investmentSchema.optional(),
  })
  .superRefine((data, context) => {
    if (data.type === "TRANSFER" && !data.destinationAccountId) {
      addIssue(
        context,
        ["destinationAccountId"],
        "Select a destination account for the transfer."
      )
    }

    if (
      data.type === "TRANSFER" &&
      data.destinationAccountId === data.accountId
    ) {
      addIssue(
        context,
        ["destinationAccountId"],
        "The destination account must be different from the source account."
      )
    }

    if (requiresManualAmount(data.type)) {
      if (!data.amount || !signedAmountPattern.test(data.amount)) {
        addIssue(context, ["amount"], "Enter a valid amount.")
      }
    }

    if (!requiresInvestmentDetail(data.type) && data.type !== "DIVIDEND") {
      return
    }

    if (!data.investment?.assetId) {
      if (data.type !== "DIVIDEND") {
        addIssue(context, ["investment", "assetId"], "Select an asset.")
      }
      return
    }

    const expectedTradeType = getInvestmentTradeType(data.type)
    if (data.investment.tradeType !== expectedTradeType) {
      addIssue(
        context,
        ["investment", "tradeType"],
        "Trade type does not match the transaction type."
      )
    }

    if (requiresQuantity(data.type) && !isPositiveDecimal(data.investment.quantity)) {
      addIssue(
        context,
        ["investment", "quantity"],
        data.type === "INVESTMENT_SPLIT"
          ? "Split ratio must be greater than zero."
          : "Quantity must be greater than zero."
      )
    }

    if (requiresPrice(data.type) && !isPositiveDecimal(data.investment.price)) {
      addIssue(
        context,
        ["investment", "price"],
        "Price must be greater than zero."
      )
    }

    if (
      supportsFees(data.type) &&
      data.investment.fees &&
      !isNonNegativeDecimal(data.investment.fees)
    ) {
      addIssue(
        context,
        ["investment", "fees"],
        "Fees must be zero or greater."
      )
    }

    if (
      data.type === "INVESTMENT_SELL" &&
      isPositiveDecimal(data.investment.quantity) &&
      isPositiveDecimal(data.investment.price)
    ) {
      const calculation = calculateInvestmentTransactionAmounts({
        type: data.type,
        quantity: data.investment.quantity ?? "",
        price: data.investment.price ?? "",
        fees: data.investment.fees || "0",
      })

      if (
        calculation &&
        compareDecimals(calculation.cashImpact, "0") === -1
      ) {
        addIssue(
          context,
          ["investment", "fees"],
          "Fees cannot exceed gross sale proceeds."
        )
      }
    }
  })

export type TransactionFormValues = z.input<typeof transactionFormSchema>
export type ParsedTransactionFormValues = z.output<typeof transactionFormSchema>
export type TransactionFormPayload = TransactionPayload

export function requiresManualAmount(type: TransactionType): boolean {
  return (
    type === "INCOME" ||
    type === "EXPENSE" ||
    type === "TRANSFER" ||
    type === "REFUND" ||
    type === "FEE" ||
    type === "DIVIDEND" ||
    type === "INTEREST" ||
    type === "ADJUSTMENT"
  )
}

export function requiresInvestmentDetail(type: TransactionType): boolean {
  return (
    type === "INVESTMENT_BUY" ||
    type === "INVESTMENT_SELL" ||
    type === "INVESTMENT_SPLIT" ||
    type === "INVESTMENT_BONUS" ||
    type === "INVESTMENT_REINVESTMENT" ||
    type === "INVESTMENT_DEPOSIT" ||
    type === "INVESTMENT_WITHDRAWAL"
  )
}

export function requiresQuantity(type: TransactionType): boolean {
  return requiresInvestmentDetail(type)
}

export function requiresPrice(type: TransactionType): boolean {
  return (
    type === "INVESTMENT_BUY" ||
    type === "INVESTMENT_SELL" ||
    type === "INVESTMENT_REINVESTMENT"
  )
}

export function supportsFees(type: TransactionType): boolean {
  return requiresPrice(type)
}

function addIssue(
  context: z.RefinementCtx,
  path: PropertyKey[],
  message: string
): void {
  context.addIssue({
    code: "custom",
    message,
    path,
  })
}
