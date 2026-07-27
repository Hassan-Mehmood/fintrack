"use client"

import { Controller, useForm } from "react-hook-form"
import { useEffect } from "react"
import { CircleAlertIcon, PlusIcon, SaveIcon } from "lucide-react"

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
  assetFormSchema,
  currencyValues,
  type AssetFormPayload,
  type AssetFormValues,
} from "./asset-form-schema"
import { type Asset, type AssetCategory, type RiskProfile } from "./asset-types"

interface AssetFormDialogProps {
  readonly asset?: Asset | null
  readonly categories: readonly AssetCategory[]
  readonly defaultCurrency?: (typeof currencyValues)[number]
  readonly errorMessage?: string | null
  readonly isPending?: boolean
  readonly mode: "create" | "edit"
  readonly onOpenChange: (open: boolean) => void
  readonly onSubmit: (payload: AssetFormPayload) => Promise<void>
  readonly open: boolean
  readonly riskProfiles: readonly RiskProfile[]
}

export function AssetFormDialog({
  asset,
  categories,
  defaultCurrency = "USD",
  errorMessage,
  isPending = false,
  mode,
  onOpenChange,
  onSubmit,
  open,
  riskProfiles,
}: AssetFormDialogProps) {
  const form = useForm<AssetFormValues>({
    defaultValues: getDefaultValues(asset, defaultCurrency),
  })

  useEffect(() => {
    if (open) {
      form.reset(getDefaultValues(asset, defaultCurrency))
    }
  }, [asset, defaultCurrency, form, open])

  const {
    control,
    clearErrors,
    formState: { errors },
    handleSubmit,
    register,
    setError,
  } = form

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add asset" : "Edit asset"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Create an investment asset such as a stock, fund, or cryptocurrency."
              : "Update the asset details and current market price."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(async (values) => {
            clearErrors()

            const parsedValues = assetFormSchema.safeParse(values)

            if (!parsedValues.success) {
              parsedValues.error.issues.forEach((issue) => {
                const fieldName = issue.path[0]

                if (typeof fieldName === "string") {
                  setError(fieldName as keyof AssetFormValues, {
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
            <Field
              data-disabled={Boolean(asset?.provider) || undefined}
              data-invalid={Boolean(errors.name) || undefined}
            >
              <FieldLabel htmlFor="asset-name">Asset name</FieldLabel>
              <Input
                id="asset-name"
                aria-invalid={Boolean(errors.name) || undefined}
                placeholder="Bitcoin"
                disabled={Boolean(asset?.provider)}
                {...register("name")}
              />
              <FieldError errors={[errors.name]} />
            </Field>

            <Field
              data-disabled={Boolean(asset?.provider) || undefined}
              data-invalid={Boolean(errors.symbol) || undefined}
            >
              <FieldLabel htmlFor="asset-symbol">Symbol</FieldLabel>
              <Input
                id="asset-symbol"
                aria-invalid={Boolean(errors.symbol) || undefined}
                placeholder="BTC"
                disabled={Boolean(asset?.provider)}
                {...register("symbol")}
              />
              <FieldDescription>
                Ticker or short code for the asset.
              </FieldDescription>
              <FieldError errors={[errors.symbol]} />
            </Field>

            <Field
              data-disabled={Boolean(asset?.provider) || undefined}
              data-invalid={Boolean(errors.categoryId) || undefined}
            >
              <FieldLabel htmlFor="asset-category">Category</FieldLabel>
              <Controller
                control={control}
                name="categoryId"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={Boolean(asset?.provider)}
                  >
                    <SelectTrigger
                      id="asset-category"
                      aria-invalid={Boolean(errors.categoryId) || undefined}
                      className="w-full"
                    >
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[errors.categoryId]} />
            </Field>

            <Field data-invalid={Boolean(errors.riskProfileId) || undefined}>
              <FieldLabel htmlFor="asset-risk-profile">Risk profile</FieldLabel>
              <Controller
                control={control}
                name="riskProfileId"
                render={({ field }) => (
                  <Select
                    value={field.value ?? ""}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger
                      id="asset-risk-profile"
                      aria-invalid={Boolean(errors.riskProfileId) || undefined}
                      className="w-full"
                    >
                      <SelectValue placeholder="Select a risk profile" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="">None</SelectItem>
                        {riskProfiles.map((profile) => (
                          <SelectItem key={profile.id} value={profile.id}>
                            {profile.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[errors.riskProfileId]} />
            </Field>

            <Field
              data-disabled={Boolean(asset?.provider) || undefined}
              data-invalid={Boolean(errors.currentPrice) || undefined}
            >
              <FieldLabel htmlFor="asset-current-price">
                Current price
              </FieldLabel>
              <Input
                id="asset-current-price"
                aria-invalid={Boolean(errors.currentPrice) || undefined}
                inputMode="decimal"
                placeholder="0.00"
                disabled={Boolean(asset?.provider)}
                {...register("currentPrice")}
              />
              <FieldError errors={[errors.currentPrice]} />
            </Field>

            <Field
              data-disabled={Boolean(asset?.provider) || undefined}
              data-invalid={Boolean(errors.priceCurrency) || undefined}
            >
              <FieldLabel htmlFor="asset-price-currency">
                Price currency
              </FieldLabel>
              <Controller
                control={control}
                name="priceCurrency"
                render={({ field }) => (
                  <Select
                    value={field.value ?? ""}
                    onValueChange={field.onChange}
                    disabled={Boolean(asset?.provider)}
                  >
                    <SelectTrigger
                      id="asset-price-currency"
                      aria-invalid={Boolean(errors.priceCurrency) || undefined}
                      className="w-full"
                    >
                      <SelectValue placeholder="Select a currency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      <SelectItem value="USD">USD — US Dollar</SelectItem>
                      <SelectItem value="PKR">PKR — Pakistani Rupee</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[errors.priceCurrency]} />
            </Field>
          </FieldGroup>

          <Field data-invalid={Boolean(errors.notes) || undefined}>
            <FieldLabel htmlFor="asset-notes">Notes</FieldLabel>
            <Input
              id="asset-notes"
              aria-invalid={Boolean(errors.notes) || undefined}
              placeholder="Optional notes about this asset"
              {...register("notes")}
            />
            <FieldError errors={[errors.notes]} />
          </Field>

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
              {mode === "create" ? "Create asset" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function getDefaultValues(
  asset: Asset | null | undefined,
  defaultCurrency: (typeof currencyValues)[number]
): AssetFormValues {
  if (!asset) {
    return {
      name: "",
      symbol: "",
      categoryId: "",
      riskProfileId: "",
      currentPrice: "",
      priceCurrency: defaultCurrency,
      notes: "",
    }
  }

  return {
    name: asset.name,
    symbol: asset.symbol ?? "",
    categoryId: asset.categoryId,
    riskProfileId: asset.riskProfileId ?? "",
    currentPrice: asset.currentPrice ?? "",
    priceCurrency: (asset.priceCurrency as (typeof currencyValues)[number] | undefined) ?? defaultCurrency,
    notes: asset.notes ?? "",
  }
}
