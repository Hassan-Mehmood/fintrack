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
  accountFormSchema,
  type AccountFormPayload,
  type AccountFormValues,
} from "./account-form-schema"
import { accountTypeOptions, type Account } from "./account-types"

interface AccountFormDialogProps {
  readonly account?: Account | null
  readonly errorMessage?: string | null
  readonly isPending?: boolean
  readonly mode: "create" | "edit"
  readonly onOpenChange: (open: boolean) => void
  readonly onSubmit: (payload: AccountFormPayload) => Promise<void>
  readonly open: boolean
}

export function AccountFormDialog({
  account,
  errorMessage,
  isPending = false,
  mode,
  onOpenChange,
  onSubmit,
  open,
}: AccountFormDialogProps) {
  const form = useForm<AccountFormValues>({
    defaultValues: getDefaultValues(account),
  })

  useEffect(() => {
    if (open) {
      form.reset(getDefaultValues(account))
    }
  }, [account, form, open])

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
          <DialogTitle>
            {mode === "create" ? "Add account" : "Edit account"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Create a new financial account with its starting balance."
              : "Update the stored account details and opening balance."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(async (values) => {
            clearErrors()

            const parsedValues = accountFormSchema.safeParse(values)

            if (!parsedValues.success) {
              parsedValues.error.issues.forEach((issue) => {
                const fieldName = issue.path[0]

                if (typeof fieldName === "string") {
                  setError(fieldName as keyof AccountFormValues, {
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
            <Field data-invalid={Boolean(errors.name) || undefined}>
              <FieldLabel htmlFor="account-name">Account name</FieldLabel>
              <Input
                id="account-name"
                aria-invalid={Boolean(errors.name) || undefined}
                placeholder="Primary checking"
                {...register("name")}
              />
              <FieldError errors={[errors.name]} />
            </Field>

            <Field data-invalid={Boolean(errors.type) || undefined}>
              <FieldLabel htmlFor="account-type">Account type</FieldLabel>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger
                      id="account-type"
                      aria-invalid={Boolean(errors.type) || undefined}
                      className="w-full"
                    >
                      <SelectValue placeholder="Select a type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {accountTypeOptions.map((option) => (
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

            <Field data-invalid={Boolean(errors.currency) || undefined}>
              <FieldLabel htmlFor="account-currency">Currency</FieldLabel>
              <Input
                id="account-currency"
                aria-invalid={Boolean(errors.currency) || undefined}
                className="uppercase"
                maxLength={3}
                placeholder="USD"
                {...register("currency")}
              />
              <FieldDescription>
                Use a 3-letter currency code such as USD or PKR.
              </FieldDescription>
              <FieldError errors={[errors.currency]} />
            </Field>

            <Field data-invalid={Boolean(errors.openingBalance) || undefined}>
              <FieldLabel htmlFor="account-opening-balance">
                Opening balance
              </FieldLabel>
              <Input
                id="account-opening-balance"
                aria-invalid={Boolean(errors.openingBalance) || undefined}
                inputMode="decimal"
                placeholder="0.00"
                {...register("openingBalance")}
              />
              <FieldDescription>
                Starting balance before any recorded transactions.
              </FieldDescription>
              <FieldError errors={[errors.openingBalance]} />
            </Field>
          </FieldGroup>

          <Field data-invalid={Boolean(errors.openedAt) || undefined}>
            <FieldLabel htmlFor="account-opened-at">Opened on</FieldLabel>
            <Input
              id="account-opened-at"
              aria-invalid={Boolean(errors.openedAt) || undefined}
              type="date"
              {...register("openedAt")}
            />
            <FieldError errors={[errors.openedAt]} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
              {mode === "create" ? "Create account" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function getDefaultValues(account?: Account | null): AccountFormValues {
  if (!account) {
    return {
      name: "",
      type: "BANK",
      currency: "USD",
      openingBalance: "0",
      openedAt: "",
    }
  }

  return {
    name: account.name,
    type: account.type,
    currency: account.currency,
    openingBalance: account.openingBalance,
    openedAt: account.openedAt.slice(0, 10),
  }
}
