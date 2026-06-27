import { z } from "zod/v4"

import { accountTypeValues } from "./account-types"

const openingBalancePattern = /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/

export const accountFormSchema = z.object({
  name: z.string().trim().min(1, "Enter an account name.").max(120),
  type: z.enum(accountTypeValues, {
    error: "Select an account type.",
  }),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Use a 3-letter currency code."),
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
