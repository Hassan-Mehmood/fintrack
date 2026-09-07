"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { formatAmount } from "@/lib/formatting"
import { createWatchlist, deleteWatchlist, listWatchlists, removeWatchlistItem, renameWatchlist, watchlistsQueryKey } from "./watchlists-api"

export function WatchlistsPanel({ domain, getToken, onAddHolding }: { readonly domain: "SECURITIES" | "CRYPTO"; readonly getToken: () => Promise<string | null>; readonly onAddHolding: () => void }) {
  const client = useQueryClient()
  const [name, setName] = useState("")
  const query = useQuery({ queryKey: [...watchlistsQueryKey, domain], queryFn: () => listWatchlists(getToken, domain) })
  const refresh = () => client.invalidateQueries({ queryKey: watchlistsQueryKey })
  const create = useMutation({ mutationFn: () => createWatchlist(getToken, name, domain), onSuccess: () => { setName(""); void refresh() } })
  const remove = useMutation({ mutationFn: (id: string) => deleteWatchlist(getToken, id), onSuccess: refresh })
  const rename = useMutation({ mutationFn: ({ id, name }: { id: string; name: string }) => renameWatchlist(getToken, id, name), onSuccess: refresh })
  const removeItem = useMutation({ mutationFn: ({ id, assetId }: { id: string; assetId: string }) => removeWatchlistItem(getToken, id, assetId), onSuccess: refresh })

  return <div className="grid gap-4">
    <Card><CardHeader><CardTitle>Watchlists</CardTitle><CardDescription>Track prices without changing balances or holdings.</CardDescription></CardHeader><CardContent className="flex gap-2"><Input placeholder="New watchlist name" value={name} onChange={(e) => setName(e.target.value)} /><Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}><PlusIcon />Create</Button></CardContent></Card>
    {query.data?.length ? query.data.map((list) => <Card key={list.id}><CardHeader><div className="flex items-center justify-between"><div><CardTitle>{list.name}</CardTitle><CardDescription>{list.items.length} item{list.items.length === 1 ? "" : "s"}</CardDescription></div><div className="flex gap-1"><Button size="icon-sm" variant="ghost" aria-label={`Rename ${list.name}`} onClick={() => { const next = window.prompt("Watchlist name", list.name)?.trim(); if (next && next !== list.name) rename.mutate({ id: list.id, name: next }) }}><PencilIcon /></Button><Button size="icon-sm" variant="ghost" aria-label={`Delete ${list.name}`} onClick={() => remove.mutate(list.id)}><Trash2Icon /></Button></div></div></CardHeader><CardContent>{list.items.length ? <div className="divide-y">{list.items.map((asset) => <div key={asset.id} className="flex items-center justify-between gap-3 py-3"><div><p className="font-medium">{asset.name}</p><p className="text-xs text-muted-foreground">{asset.symbol ?? "—"} · {asset.priceStatus === "STALE" ? "Stale price" : asset.priceType === "EOD" ? "End-of-day price" : "Current price"}</p></div><div className="flex items-center gap-2"><span className="font-mono">{asset.currentPrice && asset.priceCurrency ? formatAmount(asset.currentPrice, asset.priceCurrency) : "Unavailable"}</span><Button size="sm" variant="outline" onClick={onAddHolding}>Add holding</Button><Button size="icon-sm" variant="ghost" aria-label={`Remove ${asset.name}`} onClick={() => removeItem.mutate({ id: list.id, assetId: asset.id })}><Trash2Icon /></Button></div></div>)}</div> : <Empty><EmptyHeader><EmptyTitle>No watched assets</EmptyTitle><EmptyDescription>Add assets from market search to this list.</EmptyDescription></EmptyHeader></Empty>}</CardContent></Card>) : <Empty className="border"><EmptyHeader><EmptyTitle>No watchlists yet</EmptyTitle><EmptyDescription>Create a named list for assets you want to follow.</EmptyDescription></EmptyHeader></Empty>}
  </div>
}
