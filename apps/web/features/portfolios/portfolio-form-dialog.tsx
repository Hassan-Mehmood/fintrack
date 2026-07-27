"use client"

import { Controller, useForm } from "react-hook-form"
import { useEffect } from "react"
import { CircleAlertIcon, PlusIcon, SaveIcon } from "lucide-react"

import type { Account } from "@/features/accounts/account-types"
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
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Badge } from "@/components/ui/badge"
import { getAccountTypeLabel } from "@/features/accounts/account-types"

import {
  portfolioFormSchema,
  type PortfolioFormPayload,
  type PortfolioFormValues,
} from "./portfolio-form-schema"
import type { Portfolio } from "./portfolio-types"

interface PortfolioFormDialogProps {
  readonly accounts: readonly Account[]
  readonly errorMessage?: string | null
  readonly isPending?: boolean
  readonly mode: "create" | "edit"
  readonly onOpenChange: (open: boolean) => void
  readonly onSubmit: (payload: PortfolioFormPayload) => Promise<void>
  readonly open: boolean
  readonly portfolio?: Portfolio | null
}

export function PortfolioFormDialog({
  accounts,
  errorMessage,
  isPending = false,
  mode,
  onOpenChange,
  onSubmit,
  open,
  portfolio,
}: PortfolioFormDialogProps) {
  const form = useForm<PortfolioFormValues>({
    defaultValues: getDefaultValues(portfolio),
  })

  useEffect(() => {
    if (open) {
      form.reset(getDefaultValues(portfolio))
    }
  }, [form, open, portfolio])

  const {
    clearErrors,
    control,
    formState: { errors },
    handleSubmit,
    register,
    setError,
  } = form

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Create portfolio" : "Edit portfolio"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Group accounts together to track a custom portfolio."
              : "Update the portfolio name, description, and accounts."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(async (values) => {
            clearErrors()

            const parsedValues = portfolioFormSchema.safeParse(values)

            if (!parsedValues.success) {
              parsedValues.error.issues.forEach((issue) => {
                const fieldName = issue.path[0]

                if (typeof fieldName === "string") {
                  setError(fieldName as keyof PortfolioFormValues, {
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

          <FieldGroup className="grid gap-5">
            <Field data-invalid={Boolean(errors.name) || undefined}>
              <FieldLabel htmlFor="portfolio-name">Name</FieldLabel>
              <Input
                id="portfolio-name"
                aria-invalid={Boolean(errors.name) || undefined}
                placeholder="Retirement, Crypto, etc."
                {...register("name")}
              />
              <FieldError errors={[errors.name]} />
            </Field>

            <Field data-invalid={Boolean(errors.description) || undefined}>
              <FieldLabel htmlFor="portfolio-description">
                Description
              </FieldLabel>
              <Input
                id="portfolio-description"
                aria-invalid={Boolean(errors.description) || undefined}
                placeholder="Optional"
                {...register("description")}
              />
              <FieldError errors={[errors.description]} />
            </Field>

            <Field data-invalid={Boolean(errors.accountIds) || undefined}>
              <FieldLabel>Accounts</FieldLabel>
              <Controller
                control={control}
                name="accountIds"
                render={({ field }) => (
                  <div className="flex max-h-60 flex-col gap-2 overflow-y-auto rounded-md border p-3">
                    {accounts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No accounts available.
                      </p>
                    ) : (
                      accounts.map((account) => {
                        const selected = field.value.includes(account.id)

                        return (
                          <label
                            key={account.id}
                            className="flex cursor-pointer items-center justify-between gap-3 rounded-md border p-2 hover:bg-muted"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <input
                                type="checkbox"
                                className="size-4 shrink-0"
                                checked={selected}
                                onChange={(event) => {
                                  const next = event.target.checked
                                    ? [...field.value, account.id]
                                    : field.value.filter(
                                        (id) => id !== account.id
                                      )

                                  field.onChange(next)
                                }}
                              />
                              <span className="truncate text-sm font-medium">
                                {account.name}
                              </span>
                            </div>
                            <Badge variant="secondary">
                              {getAccountTypeLabel(account.type)}
                            </Badge>
                          </label>
                        )
                      })
                    )}
                  </div>
                )}
              />
              <FieldError errors={[errors.accountIds]} />
            </Field>
          </FieldGroup>

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
              {mode === "create" ? "Create portfolio" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function getDefaultValues(
  portfolio: Portfolio | null | undefined
): PortfolioFormValues {
  if (!portfolio) {
    return {
      name: "",
      description: "",
      accountIds: [],
    }
  }

  return {
    name: portfolio.name,
    description: portfolio.description ?? "",
    accountIds: portfolio.accounts.map((account) => account.id),
  }
}
