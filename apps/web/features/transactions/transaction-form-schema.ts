import { z } from "zod/v4"

import { transactionTypeValues } from "./transaction-types"

const amountPattern = /^(?:-)?(?:0|[1-9]\d*)(?:\.\d{1,8})?$/

export const transactionFormSchema = z
  .object({
    type: z.enum(transactionTypeValues, {
      error: "Select a transaction type.",
    }),
    accountId: z.string().uuid("Select an account."),
    destinationAccountId: z.string().uuid().optional().or(z.literal("")),
    amount: z.string().trim().regex(amountPattern, "Enter a valid amount."),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, "Use a 3-letter currency code."),
    occurredAt: z.string().trim().min(1, "Select a date."),
    description: z
      .string()
      .trim()
      .min(1, "Enter a description.")
      .max(255),
    merchant: z.string().trim().max(120).optional().or(z.literal("")),
    notes: z.string().trim().max(1000).optional().or(z.literal("")),
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

export type TransactionFormValues = z.input<typeof transactionFormSchema>
export type TransactionFormPayload = z.output<typeof transactionFormSchema>
