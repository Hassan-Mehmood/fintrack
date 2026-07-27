"use client"

import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import {
  CircleAlertIcon,
  SearchIcon,
  WalletCardsIcon,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
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
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"

import { searchMarketAssets } from "./assets-api"
import type { MarketSearchResult } from "./asset-types"

interface AddAssetDialogProps {
  readonly errorMessage?: string | null
  readonly getToken: () => Promise<string | null>
  readonly isPending: boolean
  readonly onAddProviderAsset: (asset: MarketSearchResult) => Promise<void>
  readonly onManualAsset: () => void
  readonly onOpenChange: (open: boolean) => void
  readonly open: boolean
}

export function AddAssetDialog({
  errorMessage,
  getToken,
  isPending,
  onAddProviderAsset,
  onManualAsset,
  onOpenChange,
  open,
}: AddAssetDialogProps) {
  const [marketType, setMarketType] = useState<"STOCK" | "CRYPTO">("STOCK")
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim())
    }, 350)
    return () => window.clearTimeout(timer)
  }, [query])

  const searchQuery = useQuery({
    queryKey: ["market-data", "search", marketType, debouncedQuery],
    queryFn: ({ signal }) =>
      searchMarketAssets(getToken, marketType, debouncedQuery, signal),
    enabled: open && debouncedQuery.length >= 2,
    retry: false,
  })

  const results = searchQuery.data ?? []

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setQuery("")
          setDebouncedQuery("")
        }
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add asset</DialogTitle>
          <DialogDescription>
            Search supported markets or continue with manual asset entry.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="market">
          <TabsList className="w-full">
            <TabsTrigger value="market">Market search</TabsTrigger>
            <TabsTrigger value="manual">Manual asset</TabsTrigger>
          </TabsList>

          <TabsContent value="market" className="flex flex-col gap-4 pt-2">
            <FieldGroup className="grid gap-4 md:grid-cols-[12rem_1fr]">
              <Field>
                <FieldLabel htmlFor="market-asset-type">Asset type</FieldLabel>
                <Select
                  value={marketType}
                  onValueChange={(value) => {
                    setMarketType(value as "STOCK" | "CRYPTO")
                  }}
                >
                  <SelectTrigger id="market-asset-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="STOCK">US stock</SelectItem>
                      <SelectItem value="CRYPTO">Cryptocurrency</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="market-asset-query">
                  Name or symbol
                </FieldLabel>
                <div className="relative">
                  <SearchIcon
                    aria-hidden="true"
                    className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id="market-asset-query"
                    className="pl-9"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={
                      marketType === "STOCK" ? "Apple or AAPL" : "Bitcoin or BTC"
                    }
                  />
                </div>
              </Field>
            </FieldGroup>

            {errorMessage ? (
              <Alert variant="destructive">
                <CircleAlertIcon aria-hidden="true" />
                <AlertTitle>Unable to add asset</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            ) : null}

            {searchQuery.isError ? (
              <Alert variant="destructive">
                <CircleAlertIcon aria-hidden="true" />
                <AlertTitle>Search failed</AlertTitle>
                <AlertDescription>{searchQuery.error.message}</AlertDescription>
              </Alert>
            ) : searchQuery.isFetching ? (
              <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
                <Spinner />
                Searching markets…
              </div>
            ) : debouncedQuery.length < 2 ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <SearchIcon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>Search market assets</EmptyTitle>
                  <EmptyDescription>
                    Enter at least two characters to search by name or symbol.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : results.length === 0 ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <SearchIcon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>No matching assets</EmptyTitle>
                  <EmptyDescription>
                    Try another name or symbol, or add the asset manually.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
                {results.map((result) => (
                  <Button
                    key={`${result.provider}:${result.providerAssetId}`}
                    variant="outline"
                    className="h-auto justify-start py-3"
                    disabled={isPending}
                    onClick={() => onAddProviderAsset(result)}
                  >
                    <Avatar>
                      {result.imageUrl ? (
                        <AvatarImage src={result.imageUrl} alt="" />
                      ) : null}
                      <AvatarFallback>
                        {result.symbol.slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="flex min-w-0 flex-1 flex-col items-start">
                      <span className="truncate font-medium">{result.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {result.symbol} · {result.providerAssetId}
                      </span>
                    </span>
                    <span className="flex shrink-0 gap-2">
                      {result.exchange ? (
                        <Badge variant="outline">{result.exchange}</Badge>
                      ) : null}
                      <Badge variant="secondary">{result.provider}</Badge>
                    </span>
                  </Button>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="manual" className="pt-2">
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <WalletCardsIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>Create a manual asset</EmptyTitle>
                <EmptyDescription>
                  Use manual entry for funds, bonds, commodities, private
                  investments, or unsupported market assets.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={onManualAsset}>
                  Continue to manual entry
                </Button>
              </EmptyContent>
            </Empty>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
