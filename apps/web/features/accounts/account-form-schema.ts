import { z } from "zod/v4"

import { accountTypeValues } from "./account-types"

const openingBalancePattern = /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/

export const currencyValues = ["USD", "PKR"] as const

export const accountFormSchema = z.object({
  name: z.string().trim().min(1, "Enter an account name.").max(120),
  type: z.enum(accountTypeValues, {
    error: "Select an account type.",
  }),
  currency: z.enum(currencyValues, {
    error: "Select a currency.",
  }),
  openingBalance: z
    .string()
    .trim()
    .regex(openingBalancePattern, "Enter a valid opening balance."),
  openedAt: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined)),
})

export type AccountFormValues = z.input<typeof accountFormSchema>
export type AccountFormPayload = z.output<typeof accountFormSchema>
