import { z } from "zod/v4"

const pricePattern = /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/

export const currencyValues = ["USD", "PKR"] as const

export const assetFormSchema = z.object({
  name: z.string().trim().min(1, "Enter an asset name.").max(120),
  symbol: z
    .string()
    .trim()
    .max(20, "Symbol must be 20 characters or less.")
    .optional()
    .or(z.literal("")),
  categoryId: z.string().uuid("Select a category."),
  riskProfileId: z.string().uuid().optional().or(z.literal("")),
  currentPrice: z
    .string()
    .trim()
    .regex(pricePattern, "Enter a valid price.")
    .optional()
    .or(z.literal("")),
  priceCurrency: z.enum(currencyValues).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
})

export type AssetFormValues = z.input<typeof assetFormSchema>
export type AssetFormPayload = z.output<typeof assetFormSchema>
