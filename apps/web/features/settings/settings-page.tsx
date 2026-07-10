"use client"

import { useAuth } from "@clerk/nextjs"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { z } from "zod/v4"
import {
  CircleAlertIcon,
  SaveIcon,
  SettingsIcon,
} from "lucide-react"

import { AppShell } from "@/components/app-shell"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"

import { getSettings, settingsQueryKey, updateSettings } from "./settings-api"

const exchangeRatePattern = /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/

const settingsSchema = z.object({
  baseCurrency: z.enum(["USD", "PKR"], { error: "Select a currency." }),
  exchangeRate: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined))
    .refine(
      (value) => !value || exchangeRatePattern.test(value),
      "Must be a valid positive number with up to 8 decimal places.",
    ),
})

type SettingsFormValues = z.input<typeof settingsSchema>
type SettingsFormPayload = z.output<typeof settingsSchema>

export function SettingsPage() {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()

  const settingsQuery = useQuery({
    queryKey: settingsQueryKey,
    queryFn: () => getSettings(getToken),
  })

  const updateMutation = useMutation({
    mutationFn: (values: SettingsFormPayload) =>
      updateSettings(getToken, {
        baseCurrency: values.baseCurrency,
        exchangeRate: values.exchangeRate,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsQueryKey })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })

  const form = useForm<SettingsFormValues>({
    defaultValues: {
      baseCurrency: settingsQuery.data?.baseCurrency === "PKR" ? "PKR" : "USD",
      exchangeRate: settingsQuery.data?.exchangeRate ?? "",
    },
    values: {
      baseCurrency:
        settingsQuery.data?.baseCurrency === "PKR" ? "PKR" : "USD",
      exchangeRate: settingsQuery.data?.exchangeRate ?? "",
    },
  })

  const {
    control,
    clearErrors,
    formState: { errors },
    handleSubmit,
    register,
    setError,
    watch,
  } = form

  const baseCurrency = watch("baseCurrency")

  const onSubmit = async (values: SettingsFormValues) => {
    clearErrors()

    const parsed = settingsSchema.safeParse(values)

    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => {
        const fieldName = issue.path[0]

        if (typeof fieldName === "string") {
          setError(fieldName as keyof SettingsFormValues, {
            message: issue.message,
          })
        }
      })

      return
    }

    updateMutation.mutate(parsed.data)
  }

  const isLoading = settingsQuery.isLoading
  const isError = settingsQuery.isError

  return (
    <AppShell
      currentSection="settings"
      title="Settings"
      description="Manage your preferences and currency settings."
    >
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
        {isError ? (
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden="true" />
            <AlertTitle>Unable to load settings</AlertTitle>
            <AlertDescription>{settingsQuery.error.message}</AlertDescription>
          </Alert>
        ) : null}

        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SettingsIcon className="size-5" />
              Currency settings
            </CardTitle>
            <CardDescription>
              Choose your default currency and set the exchange rate for
              conversions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="flex flex-col gap-4"
            >
              <Field>
                <FieldLabel>Default currency</FieldLabel>
                {isLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <Select
                    value={baseCurrency}
                    onValueChange={(value) =>
                      form.setValue("baseCurrency", value as "USD" | "PKR", {
                        shouldValidate: true,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a currency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD — US Dollar</SelectItem>
                      <SelectItem value="PKR">PKR — Pakistani Rupee</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <FieldError errors={[{ message: errors.baseCurrency?.message }]} />
              </Field>

              <Field>
                <FieldLabel>Exchange rate</FieldLabel>
                <FieldDescription>
                  {baseCurrency === "USD"
                    ? "How many PKR equal 1 USD (e.g., 280). Used to convert PKR amounts to USD."
                    : "How many PKR equal 1 USD (e.g., 280). Used to convert USD amounts to PKR."}
                </FieldDescription>
                {isLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <Input
                    {...register("exchangeRate")}
                    placeholder="e.g., 280"
                    type="text"
                    inputMode="decimal"
                  />
                )}
                <FieldError errors={[{ message: errors.exchangeRate?.message }]} />
              </Field>

              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="submit"
                  disabled={updateMutation.isPending || isLoading}
                >
                  <SaveIcon data-icon="inline-start" />
                  Save
                </Button>
                {updateMutation.isSuccess ? (
                  <span className="text-sm text-[var(--state-success)]">
                    Settings saved.
                  </span>
                ) : null}
                {updateMutation.isError ? (
                  <span className="text-sm text-destructive">
                    {updateMutation.error.message}
                  </span>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </AppShell>
  )
}
