"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { listAssets, searchMarketAssets } from "@/features/assets/assets-api"
import type { PositionAssetInput } from "./investment-types"
import { addWatchlistItem, listWatchlists, watchlistsQueryKey } from "./watchlists-api"

export function AddToWatchlistDialog({ getToken, open, onOpenChange }: { readonly getToken: () => Promise<string | null>; readonly open: boolean; readonly onOpenChange: (open: boolean) => void }) {
  const client = useQueryClient()
  const [listId, setListId] = useState("")
  const [asset, setAsset] = useState<PositionAssetInput | null>(null)
  const [assetLabel, setAssetLabel] = useState("")
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [market, setMarket] = useState<"US" | "PSX" | "CRYPTO">("US")
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 350); return () => window.clearTimeout(timer) }, [search])
  const lists = useQuery({ queryKey: watchlistsQueryKey, queryFn: () => listWatchlists(getToken), enabled: open })
  const assets = useQuery({ queryKey: ["assets"], queryFn: () => listAssets(getToken), enabled: open })
  const marketSearch = useQuery({ queryKey: ["market-data", "watchlist-search", market, debouncedSearch], queryFn: ({ signal }) => searchMarketAssets(getToken, market === "CRYPTO" ? "CRYPTO" : "STOCK", debouncedSearch, signal, market === "CRYPTO" ? undefined : market), enabled: open && debouncedSearch.length >= 2, retry: false })
  const mutation = useMutation({ mutationFn: () => { if (!asset) throw new Error("Select an asset."); return addWatchlistItem(getToken, listId, asset) }, onSuccess: async () => { await client.invalidateQueries({ queryKey: watchlistsQueryKey }); onOpenChange(false) } })
  const filtered = (assets.data ?? []).filter((asset) => `${asset.name} ${asset.symbol ?? ""}`.toLowerCase().includes(search.toLowerCase()))
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>Add to watchlist</DialogTitle><DialogDescription>Search supported markets or choose an asset already in your library.</DialogDescription></DialogHeader><div className="grid grid-cols-[9rem_1fr] gap-2"><Select value={market} onValueChange={(value) => setMarket(value as typeof market)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="US">US stocks</SelectItem><SelectItem value="PSX">PSX</SelectItem><SelectItem value="CRYPTO">Crypto</SelectItem></SelectContent></Select><Input placeholder="Search assets" value={search} onChange={(e) => setSearch(e.target.value)} /></div><div className="max-h-56 space-y-2 overflow-y-auto">{filtered.slice(0, 5).map((item) => <Button key={item.id} className="w-full justify-start" variant={asset?.kind === "EXISTING" && asset.assetId === item.id ? "secondary" : "outline"} onClick={() => { setAsset({ kind: "EXISTING", assetId: item.id }); setAssetLabel(item.name) }}>{item.name} {item.symbol ? `· ${item.symbol}` : ""} · Library</Button>)}{marketSearch.data?.map((item) => <Button key={`${item.provider}:${item.providerAssetId}`} className="w-full justify-start" variant={asset?.kind === "PROVIDER" && asset.providerAssetId === item.providerAssetId ? "secondary" : "outline"} onClick={() => { setAsset({ kind: "PROVIDER", type: item.type, provider: item.provider, providerAssetId: item.providerAssetId }); setAssetLabel(item.name) }}>{item.name} · {item.symbol}</Button>)}</div>{assetLabel ? <p className="text-sm">Selected: <strong>{assetLabel}</strong></p> : null}<Select value={listId} onValueChange={setListId}><SelectTrigger><SelectValue placeholder="Select watchlist" /></SelectTrigger><SelectContent>{lists.data?.map((list) => <SelectItem key={list.id} value={list.id}>{list.name}</SelectItem>)}</SelectContent></Select>{mutation.isError || marketSearch.isError ? <p className="text-sm text-destructive">{mutation.error?.message ?? marketSearch.error?.message}</p> : null}<DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!listId || !asset || mutation.isPending} onClick={() => mutation.mutate()}>Add asset</Button></DialogFooter></DialogContent></Dialog>
}
