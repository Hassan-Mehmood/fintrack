import { z } from "zod/v4"

export const portfolioFormSchema = z.object({
  name: z.string().trim().min(1, "Enter a portfolio name.").max(120),
  description: z
    .string()
    .trim()
    .max(500, "Description must be 500 characters or less.")
    .optional()
    .or(z.literal("")),
  accountIds: z
    .array(z.string().uuid())
    .min(1, "Select at least one account."),
})

export type PortfolioFormValues = z.input<typeof portfolioFormSchema>
export type PortfolioFormPayload = z.output<typeof portfolioFormSchema>
