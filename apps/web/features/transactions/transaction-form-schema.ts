import { z } from "zod/v4"

import {
  getInvestmentTradeType,
  isInvestmentType,
  transactionTypeValues,
} from "./transaction-types"

const amountPattern = /^(?:-)?(?:0|[1-9]\d*)(?:\.\d{1,8})?$/
const positiveDecimalPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/

export const currencyValues = ["USD", "PKR"] as const

const investmentSchema = z.object({
  assetId: z.string().uuid("Select an asset."),
  tradeType: z.enum([
    "BUY",
    "SELL",
    "DIVIDEND",
    "INTEREST",
    "SPLIT",
    "BONUS",
    "REINVESTMENT",
  ]),
  quantity: z
    .string()
    .trim()
    .regex(positiveDecimalPattern, "Enter a valid quantity."),
  price: z
    .string()
    .trim()
    .regex(positiveDecimalPattern, "Enter a valid price."),
  fees: z
    .string()
    .trim()
    .regex(positiveDecimalPattern, "Enter a valid fee amount.")
    .optional()
    .or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
})

export const transactionFormSchema = z
  .object({
    type: z.enum(transactionTypeValues, {
      error: "Select a transaction type.",
    }),
    accountId: z.string().uuid("Select an account."),
    destinationAccountId: z.string().uuid().optional().or(z.literal("")),
    amount: z.string().trim().regex(amountPattern, "Enter a valid amount."),
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
  .refine(
    (data) => {
      if (data.type === "TRANSFER") {
        return Boolean(data.destinationAccountId)
      }

      return true
    },
    {
      message: "Select a destination account for the transfer.",
      path: ["destinationAccountId"],
    }
  )
  .refine(
    (data) => {
      if (data.type === "TRANSFER") {
        return data.destinationAccountId !== data.accountId
      }

      return true
    },
    {
      message:
        "The destination account must be different from the source account.",
      path: ["destinationAccountId"],
    }
  )
  .refine(
    (data) => {
      if (isInvestmentType(data.type)) {
        return Boolean(data.investment)
      }

      return true
    },
    {
      message: "Enter investment details for investment transactions.",
      path: ["investment"],
    }
  )
  .refine(
    (data) => {
      if (!data.investment || !isInvestmentType(data.type)) {
        return true
      }

      return data.investment.tradeType === getInvestmentTradeType(data.type)
    },
    {
      message: "Trade type does not match the transaction type.",
      path: ["investment", "tradeType"],
    }
  )
  .refine(
    (data) => {
      if (!data.investment || !isInvestmentType(data.type)) {
        return true
      }

      const needsPositiveQuantity =
        data.type === "INVESTMENT_BUY" ||
        data.type === "INVESTMENT_SELL" ||
        data.type === "INVESTMENT_REINVESTMENT" ||
        data.type === "INVESTMENT_SPLIT" ||
        data.type === "INVESTMENT_BONUS"

      if (needsPositiveQuantity && Number(data.investment.quantity) <= 0) {
        return false
      }

      return true
    },
    {
      message: "Quantity must be greater than zero.",
      path: ["investment", "quantity"],
    }
  )
  .refine(
    (data) => {
      if (!data.investment || !isInvestmentType(data.type)) {
        return true
      }

      const needsPositivePrice =
        data.type === "INVESTMENT_BUY" ||
        data.type === "INVESTMENT_SELL" ||
        data.type === "INVESTMENT_REINVESTMENT"

      if (needsPositivePrice && Number(data.investment.price) <= 0) {
        return false
      }

      return true
    },
    {
      message: "Price must be greater than zero.",
      path: ["investment", "price"],
    }
  )
  .refine(
    (data) => {
      if (!data.investment || !isInvestmentType(data.type)) {
        return true
      }

      const needsZeroPriceAndQuantity =
        data.type === "DIVIDEND" || data.type === "INTEREST"

      if (
        needsZeroPriceAndQuantity &&
        (Number(data.investment.quantity) !== 0 ||
          Number(data.investment.price) !== 0)
      ) {
        return false
      }

      return true
    },
    {
      message: "Quantity and price must be zero for dividend and interest.",
      path: ["investment", "quantity"],
    }
  )

export type TransactionFormValues = z.input<typeof transactionFormSchema>
export type TransactionFormPayload = z.output<typeof transactionFormSchema>
