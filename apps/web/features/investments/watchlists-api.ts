import type { Asset } from "@/features/assets/asset-types"
import type { PositionAssetInput } from "./investment-types"

type GetToken = () => Promise<string | null>

export interface Watchlist {
  readonly domain: "SECURITIES" | "CRYPTO"
  readonly id: string
  readonly name: string
  readonly displayOrder: number
  readonly items: readonly Asset[]
}

export const watchlistsQueryKey = ["watchlists"] as const

export async function listWatchlists(getToken: GetToken, domain: "SECURITIES" | "CRYPTO"): Promise<readonly Watchlist[]> {
  return (await request<{ readonly data: readonly Watchlist[] }>(getToken, `/api/v1/watchlists?domain=${domain}`)).data
}

export async function createWatchlist(getToken: GetToken, name: string, domain: "SECURITIES" | "CRYPTO") {
  return (await request<{ readonly data: Watchlist }>(getToken, "/api/v1/watchlists", { method: "POST", body: JSON.stringify({ name, domain }) })).data
}

export async function renameWatchlist(getToken: GetToken, id: string, name: string) {
  await request(getToken, `/api/v1/watchlists/${id}`, { method: "PATCH", body: JSON.stringify({ name }) })
}

export async function deleteWatchlist(getToken: GetToken, id: string) {
  await request(getToken, `/api/v1/watchlists/${id}`, { method: "DELETE" })
}

export async function addWatchlistItem(getToken: GetToken, id: string, asset: PositionAssetInput) {
  await request(getToken, `/api/v1/watchlists/${id}/items`, { method: "POST", body: JSON.stringify(asset) })
}

export async function removeWatchlistItem(getToken: GetToken, id: string, assetId: string) {
  await request(getToken, `/api/v1/watchlists/${id}/items/${assetId}`, { method: "DELETE" })
}

async function request<T>(getToken: GetToken, path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken()
  if (!token) throw new Error("Unable to read the active Clerk session token.")
  const base = process.env.NEXT_PUBLIC_API_BASE_URL
  if (!base) throw new Error("NEXT_PUBLIC_API_BASE_URL is required.")
  const response = await fetch(`${base.replace(/\/$/, "")}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers } })
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new Error(payload?.error?.message ?? `Request failed with status ${response.status}.`)
  }
  return (await response.json()) as T
}
