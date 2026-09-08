"use client"

import { useAuth } from "@clerk/nextjs"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { PencilLineIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useMemo, useState } from "react"

import { accountsQueryKey, listAccounts } from "@/features/accounts/accounts-api"
import {
  createPortfolio,
  deletePortfolio,
  portfoliosQueryKey,
  updatePortfolio,
} from "@/features/portfolios/portfolios-api"
import type { Portfolio } from "@/features/portfolios/portfolio-types"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { formatAmount, formatSignedAmount } from "@/lib/formatting"

import type { Holding } from "./investment-types"

interface InvestmentPortfoliosPanelProps {
  readonly domain: "SECURITIES" | "CRYPTO"
  readonly holdings: readonly Holding[]
  readonly portfolios: readonly Portfolio[]
}

export function InvestmentPortfoliosPanel({ domain, holdings, portfolios }: InvestmentPortfoliosPanelProps) {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Portfolio | "new" | null>(null)
  const accountsQuery = useQuery({ queryKey: [...accountsQueryKey, domain], queryFn: () => listAccounts(getToken, domain) })
  const save = useMutation({
    mutationFn: async (values: PortfolioEditorValues) => {
      const payload = {
        domain,
        name: values.name,
        description: values.description || undefined,
        holdings: values.holdings.map((key) => splitPositionKey(key)),
        cashAllocations: domain === "CRYPTO" ? [] : Object.entries(values.cashAllocations)
          .filter(([, percentage]) => Number(percentage) > 0)
          .map(([accountId, percentage]) => ({ accountId, percentage })),
      }
      return editing === "new"
        ? createPortfolio(getToken, payload)
        : updatePortfolio(getToken, editing!.id, payload)
    },
    onSuccess: async () => {
      setEditing(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: portfoliosQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["investments"] }),
      ])
    },
  })
  const remove = useMutation({
    mutationFn: (id: string) => deletePortfolio(getToken, id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: portfoliosQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["investments"] }),
      ])
    },
  })

  if (portfolios.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader><EmptyTitle>No portfolios yet</EmptyTitle><EmptyDescription>{domain === "CRYPTO" ? "Create a portfolio from individual crypto and stablecoin holdings." : "Create a portfolio from individual holdings and optionally allocate account cash."}</EmptyDescription></EmptyHeader>
        <EmptyContent><Button onClick={() => setEditing("new")}><PlusIcon data-icon="inline-start" />Create portfolio</Button></EmptyContent>
        {editing !== null ? <PortfolioEditor domain={domain} portfolio={null} holdings={holdings} portfolios={portfolios} accounts={accountsQuery.data ?? []} pending={save.isPending} error={save.error?.message} onClose={() => setEditing(null)} onSave={(values) => save.mutate(values)} /> : null}
      </Empty>
    )
  }

  return (
    <div className="grid gap-4">
      <div className="flex justify-end"><Button onClick={() => setEditing("new")}><PlusIcon data-icon="inline-start" />Create portfolio</Button></div>
      <div className="grid gap-4 md:grid-cols-2">
        {portfolios.map((portfolio) => (
          <Card key={portfolio.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div><CardTitle>{portfolio.name}</CardTitle><CardDescription>{portfolio.holdings.length} position{portfolio.holdings.length === 1 ? "" : "s"}{domain === "SECURITIES" ? ` · ${portfolio.cashAllocations.length} cash allocation${portfolio.cashAllocations.length === 1 ? "" : "s"}` : ""}</CardDescription></div>
                <div className="flex gap-1">
                  <Button size="icon-sm" variant="ghost" aria-label={`Edit ${portfolio.name}`} onClick={() => setEditing(portfolio)}><PencilLineIcon /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`Delete ${portfolio.name}`} disabled={remove.isPending} onClick={() => { if (window.confirm(`Delete “${portfolio.name}”? Holdings, accounts, and transactions will remain intact.`)) remove.mutate(portfolio.id) }}><Trash2Icon /></Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div><p className="text-xs text-muted-foreground">Total value</p><p className="font-mono font-medium">{formatAmount(portfolio.metrics.totalValue, portfolio.metrics.baseCurrency)}</p></div>
              <div><p className="text-xs text-muted-foreground">Unrealized</p><p className="font-mono font-medium">{portfolio.metrics.totalUnrealizedGain ? formatSignedAmount(portfolio.metrics.totalUnrealizedGain, portfolio.metrics.baseCurrency) : "Unavailable"}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>
      {editing !== null ? <PortfolioEditor domain={domain} portfolio={editing === "new" ? null : editing} holdings={holdings} portfolios={portfolios} accounts={accountsQuery.data ?? []} pending={save.isPending} error={save.error?.message} onClose={() => { setEditing(null); save.reset() }} onSave={(values) => save.mutate(values)} /> : null}
    </div>
  )
}

type PortfolioEditorValues = { name: string; description: string; holdings: string[]; cashAllocations: Record<string, string> }

function PortfolioEditor({ domain, portfolio, holdings, portfolios, accounts, pending, error, onClose, onSave }: {
  readonly domain: "SECURITIES" | "CRYPTO"
  readonly portfolio: Portfolio | null
  readonly holdings: readonly Holding[]
  readonly portfolios: readonly Portfolio[]
  readonly accounts: readonly { id: string; name: string; type: string; currency: string; currentBalance: string }[]
  readonly pending: boolean
  readonly error?: string
  readonly onClose: () => void
  readonly onSave: (values: PortfolioEditorValues) => void
}) {
  const [name, setName] = useState(portfolio?.name ?? "")
  const [description, setDescription] = useState(portfolio?.description ?? "")
  const [selected, setSelected] = useState<string[]>(portfolio?.holdings.map(({ accountId, assetId }) => positionKey(accountId, assetId)) ?? [])
  const [cash, setCash] = useState<Record<string, string>>(Object.fromEntries(portfolio?.cashAllocations.map(({ accountId, percentage }) => [accountId, percentage]) ?? []))
  const active = holdings.filter((holding) => holding.positionStatus === "ACTIVE")
  const investmentAccounts = accounts
  const allocatedElsewhere = useMemo(() => {
    const result = new Map<string, number>()
    portfolios.filter(({ id }) => id !== portfolio?.id).forEach((item) => item.cashAllocations.forEach(({ accountId, percentage }) => result.set(accountId, (result.get(accountId) ?? 0) + Number(percentage))))
    return result
  }, [portfolio?.id, portfolios])

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{portfolio ? "Edit portfolio" : "Create portfolio"}</DialogTitle><DialogDescription>{domain === "CRYPTO" ? "Select account-specific crypto and stablecoin positions." : "Select account-specific positions and allocate an optional percentage of each account’s current cash."}</DialogDescription></DialogHeader>
        <div className="grid gap-5">
          {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
          <div className="grid gap-2"><Label htmlFor="portfolio-name">Name</Label><Input id="portfolio-name" value={name} onChange={(event) => setName(event.target.value)} /></div>
          <div className="grid gap-2"><Label htmlFor="portfolio-description">Description</Label><Input id="portfolio-description" value={description} onChange={(event) => setDescription(event.target.value)} /></div>
          <section className="grid gap-2"><div><h3 className="text-sm font-medium">Holdings</h3><p className="text-xs text-muted-foreground">A position can belong to only one portfolio.</p></div>
            {active.length ? active.map((holding) => {
              const key = positionKey(holding.accountId, holding.assetId)
              const belongsElsewhere = holding.portfolios.some(({ id }) => id !== portfolio?.id)
              return <Label key={key} className="flex items-center gap-3 rounded-lg border p-3"><Checkbox checked={selected.includes(key)} disabled={belongsElsewhere} onCheckedChange={(checked) => setSelected((current) => checked ? [...current, key] : current.filter((item) => item !== key))} /><span className="flex-1"><span className="font-medium">{holding.assetSymbol ?? holding.assetName}</span><span className="block text-xs text-muted-foreground">{holding.accountName}{belongsElsewhere ? " · Already in another portfolio" : ""}</span></span></Label>
            }) : <p className="text-sm text-muted-foreground">Add an active holding before creating position membership.</p>}
          </section>
          {domain === "SECURITIES" ? <section className="grid gap-3"><div><h3 className="text-sm font-medium">Fiat cash allocations</h3><p className="text-xs text-muted-foreground">Percentages are applied dynamically to each account’s current cash balance.</p></div>
            {investmentAccounts.map((account) => {
              const used = allocatedElsewhere.get(account.id) ?? 0
              const maximum = Math.max(0, 100 - used)
              return <div key={account.id} className="grid grid-cols-[1fr_8rem] items-end gap-3"><div><p className="text-sm font-medium">{account.name}</p><p className="text-xs text-muted-foreground">Cash {formatAmount(account.currentBalance, account.currency)} · {maximum}% remaining</p></div><div className="grid gap-1"><Label htmlFor={`cash-${account.id}`}>Percent</Label><Input id={`cash-${account.id}`} type="number" min="0" max={maximum} step="0.01" value={cash[account.id] ?? ""} onChange={(event) => setCash((current) => ({ ...current, [account.id]: event.target.value }))} /></div></div>
            })}
          </section> : null}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={pending || !name.trim() || Object.entries(cash).some(([accountId, value]) => Number(value) < 0 || Number(value) > Math.max(0, 100 - (allocatedElsewhere.get(accountId) ?? 0)))} onClick={() => onSave({ name: name.trim(), description: description.trim(), holdings: selected, cashAllocations: cash })}>{pending ? <Spinner data-icon="inline-start" /> : null}Save portfolio</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function positionKey(accountId: string, assetId: string) { return `${accountId}:${assetId}` }
function splitPositionKey(key: string) { const separator = key.indexOf(":"); return { accountId: key.slice(0, separator), assetId: key.slice(separator + 1) } }
