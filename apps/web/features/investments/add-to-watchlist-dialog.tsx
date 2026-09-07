"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { listAssets, searchMarketAssets } from "@/features/assets/assets-api"

import type { InvestmentDomain, PositionAssetInput } from "./investment-types"
import {
  addWatchlistItem,
  listWatchlists,
  watchlistsQueryKey,
} from "./watchlists-api"

interface AddToWatchlistDialogProps {
  readonly domain: InvestmentDomain
  readonly getToken: () => Promise<string | null>
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

export function AddToWatchlistDialog({
  domain,
  getToken,
  open,
  onOpenChange,
}: AddToWatchlistDialogProps) {
  const client = useQueryClient()
  const [listId, setListId] = useState("")
  const [asset, setAsset] = useState<PositionAssetInput | null>(null)
  const [assetLabel, setAssetLabel] = useState("")
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [market, setMarket] = useState<"US" | "PSX" | "CRYPTO">(
    domain === "CRYPTO" ? "CRYPTO" : "US"
  )

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 350)
    return () => window.clearTimeout(timer)
  }, [search])

  const lists = useQuery({
    queryKey: [...watchlistsQueryKey, domain],
    queryFn: () => listWatchlists(getToken, domain),
    enabled: open,
  })
  const assets = useQuery({
    queryKey: ["assets", domain],
    queryFn: () => listAssets(getToken, domain),
    enabled: open,
  })
  const marketSearch = useQuery({
    queryKey: ["market-data", "watchlist-search", domain, market, debouncedSearch],
    queryFn: ({ signal }) =>
      searchMarketAssets(
        getToken,
        market === "CRYPTO" ? "CRYPTO" : "STOCK",
        debouncedSearch,
        signal,
        market === "CRYPTO" ? undefined : market
      ),
    enabled: open && debouncedSearch.length >= 2,
    retry: false,
  })
  const mutation = useMutation({
    mutationFn: () => {
      if (!asset) throw new Error("Select an asset.")
      return addWatchlistItem(getToken, listId, asset)
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: watchlistsQueryKey })
      onOpenChange(false)
    },
  })
  const filtered = (assets.data ?? []).filter((item) =>
    `${item.name} ${item.symbol ?? ""}`.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add to watchlist</DialogTitle>
          <DialogDescription>
            Search supported markets or choose an asset already in your library.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-[9rem_1fr] gap-2">
          {domain === "CRYPTO" ? (
            <div className="flex items-center rounded-md border px-3 text-sm">
              Crypto
            </div>
          ) : (
            <Select
              value={market}
              onValueChange={(value) => setMarket(value as "US" | "PSX")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="US">US stocks</SelectItem>
                <SelectItem value="PSX">PSX</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Input
            placeholder="Search assets"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="max-h-56 space-y-2 overflow-y-auto">
          {filtered.slice(0, 5).map((item) => (
            <Button
              key={item.id}
              className="w-full justify-start"
              variant={
                asset?.kind === "EXISTING" && asset.assetId === item.id
                  ? "secondary"
                  : "outline"
              }
              onClick={() => {
                setAsset({ kind: "EXISTING", assetId: item.id })
                setAssetLabel(item.name)
              }}
            >
              {item.name} {item.symbol ? `· ${item.symbol}` : ""} · Library
            </Button>
          ))}
          {marketSearch.data?.map((item) => (
            <Button
              key={`${item.provider}:${item.providerAssetId}`}
              className="w-full justify-start"
              variant={
                asset?.kind === "PROVIDER" &&
                asset.providerAssetId === item.providerAssetId
                  ? "secondary"
                  : "outline"
              }
              onClick={() => {
                setAsset({
                  kind: "PROVIDER",
                  type: item.type,
                  provider: item.provider,
                  providerAssetId: item.providerAssetId,
                })
                setAssetLabel(item.name)
              }}
            >
              {item.name} · {item.symbol}
            </Button>
          ))}
        </div>
        {assetLabel ? (
          <p className="text-sm">
            Selected: <strong>{assetLabel}</strong>
          </p>
        ) : null}
        <Select value={listId} onValueChange={setListId}>
          <SelectTrigger>
            <SelectValue placeholder="Select watchlist" />
          </SelectTrigger>
          <SelectContent>
            {lists.data?.map((list) => (
              <SelectItem key={list.id} value={list.id}>
                {list.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {mutation.isError || marketSearch.isError ? (
          <p className="text-sm text-destructive">
            {mutation.error?.message ?? marketSearch.error?.message}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!listId || !asset || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Add asset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
