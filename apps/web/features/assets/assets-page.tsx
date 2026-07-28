"use client"

import { useAuth } from "@clerk/nextjs"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import {
  CircleAlertIcon,
  PencilLineIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  WalletCardsIcon,
} from "lucide-react"

import { AppShell } from "@/components/app-shell"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import {
  formatAmount,
  formatDate,
  formatDateTime,
  formatSignedAmount,
} from "@/lib/formatting"

import { dashboardQueryKey } from "@/features/dashboard/dashboard-api"
import { getSettings, settingsQueryKey } from "@/features/settings/settings-api"

import { AssetFormDialog } from "./asset-form-dialog"
import { AddAssetDialog } from "./add-asset-dialog"
import { type AssetFormPayload } from "./asset-form-schema"
import {
  assetsQueryKey,
  assetMetadataQueryKey,
  createAsset,
  createProviderAsset,
  deleteAsset,
  getAssetMetadata,
  listAssets,
  updateAsset,
} from "./assets-api"
import { type Asset } from "./asset-types"
import { type MarketSearchResult } from "./asset-types"

type AssetDialogState =
  | { readonly mode: "create" }
  | { readonly asset: Asset; readonly mode: "edit" }
  | null

export function AssetsPage() {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  const [dialogState, setDialogState] = useState<AssetDialogState>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [assetToDelete, setAssetToDelete] = useState<Asset | null>(null)

  const assetsQuery = useQuery({
    queryKey: assetsQueryKey,
    queryFn: () => listAssets(getToken),
  })

  const metadataQuery = useQuery({
    queryKey: assetMetadataQueryKey,
    queryFn: () => getAssetMetadata(getToken),
  })

  const settingsQuery = useQuery({
    queryKey: settingsQueryKey,
    queryFn: () => getSettings(getToken),
  })

  const saveAssetMutation = useMutation({
    mutationFn: async ({
      assetId,
      mode,
      payload,
    }: {
      readonly assetId?: string
      readonly mode: "create" | "edit"
      readonly payload: AssetFormPayload
    }) => {
      if (mode === "create") {
        return createAsset(getToken, payload)
      }

      if (!assetId) {
        throw new Error("Asset id is required to update an asset.")
      }

      return updateAsset(getToken, assetId, payload)
    },
  })

  const deleteAssetMutation = useMutation({
    mutationFn: async (assetId: string) => deleteAsset(getToken, assetId),
  })

  const createProviderAssetMutation = useMutation({
    mutationFn: (result: MarketSearchResult) =>
      createProviderAsset(getToken, {
        provider: result.provider,
        type: result.type,
        providerAssetId: result.providerAssetId,
      }),
  })

  const assets = assetsQuery.data ?? []
  const categories = metadataQuery.data?.categories ?? []
  const riskProfiles = metadataQuery.data?.riskProfiles ?? []

  const totalAssets = assets.length
  const categoryCount = new Set(assets.map((asset) => asset.categoryId)).size

  async function handleSaveAsset(payload: AssetFormPayload): Promise<void> {
    if (!dialogState) {
      return
    }

    const effectivePayload =
      dialogState.mode === "edit" && dialogState.asset.provider
        ? {
            riskProfileId: payload.riskProfileId,
            notes: payload.notes,
          }
        : payload

    await saveAssetMutation.mutateAsync({
      assetId: dialogState.mode === "edit" ? dialogState.asset.id : undefined,
      mode: dialogState.mode,
      payload: effectivePayload as AssetFormPayload,
    })

    setDialogState(null)
    await invalidateAssetData()
  }

  async function handleAddProviderAsset(
    result: MarketSearchResult
  ): Promise<void> {
    await createProviderAssetMutation.mutateAsync(result)
    setIsAddDialogOpen(false)
    await invalidateAssetData()
  }

  async function invalidateAssetData(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: assetsQueryKey }),
      queryClient.invalidateQueries({ queryKey: dashboardQueryKey }),
    ])
  }

  async function handleDeleteAsset(): Promise<void> {
    if (!assetToDelete) {
      return
    }

    await deleteAssetMutation.mutateAsync(assetToDelete.id)
    setAssetToDelete(null)
    await invalidateAssetData()
  }

  const hasError = assetsQuery.isError || metadataQuery.isError
  const isLoading = assetsQuery.isLoading || metadataQuery.isLoading

  return (
    <AppShell
      currentSection="assets"
      title="Assets"
      description="Manage the investment assets you track across accounts."
      primaryAction={
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => invalidateAssetData()}
            disabled={assetsQuery.isFetching}
          >
            {assetsQuery.isFetching ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RefreshCwIcon data-icon="inline-start" />
            )}
            Refresh
          </Button>
          <Button size="sm" onClick={() => setIsAddDialogOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            Add asset
          </Button>
        </div>
      }
    >
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
        {hasError ? (
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden="true" />
            <AlertTitle>Unable to load assets</AlertTitle>
            <AlertDescription>
              {assetsQuery.error?.message ?? metadataQuery.error?.message}
            </AlertDescription>
          </Alert>
        ) : null}

        <section className="grid gap-4 md:grid-cols-3">
          <SummaryCard
            label="Total assets"
            value={isLoading ? "..." : String(totalAssets)}
            detail="Tracked investment assets"
          />
          <SummaryCard
            label="Categories"
            value={isLoading ? "..." : String(categoryCount)}
            detail="Distinct asset categories"
          />
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Managed assets</CardTitle>
            <CardDescription>
              View and update the assets you hold across your investment accounts.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {isLoading ? (
              <AssetsTableSkeleton />
            ) : assets.length === 0 ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <WalletCardsIcon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>No assets yet</EmptyTitle>
                  <EmptyDescription>
                    Add your first stock, fund, cryptocurrency, or commodity to start tracking investments.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button onClick={() => setIsAddDialogOpen(true)}>
                    <PlusIcon data-icon="inline-start" />
                    Create asset
                  </Button>
                </EmptyContent>
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asset</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead className="text-right">Current price</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assets.map((asset) => (
                    <TableRow key={asset.id}>
                      <TableCell>
                        <div className="flex min-w-0 flex-col gap-1">
                          <span className="truncate font-medium">
                            {asset.name}
                          </span>
                          {asset.symbol ? (
                            <span className="truncate text-xs font-mono text-muted-foreground">
                              {asset.symbol}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{asset.categoryName}</Badge>
                      </TableCell>
                      <TableCell>
                        {asset.riskProfileName ? (
                          <Badge variant="outline">
                            {asset.riskProfileName}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {asset.currentPrice && asset.priceCurrency
                          ? formatAmount(
                              asset.currentPrice,
                              asset.priceCurrency
                            )
                          : "Unavailable"}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {asset.priceChange && asset.priceCurrency
                          ? formatSignedAmount(
                              asset.priceChange,
                              asset.priceCurrency
                            )
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {asset.priceType === "EOD" && asset.providerDate
                          ? `EOD for ${formatDate(`${asset.providerDate}T00:00:00`)}`
                          : asset.providerMarketAt || asset.priceUpdatedAt
                          ? formatDateTime(
                              asset.providerMarketAt ??
                                asset.priceUpdatedAt ??
                                asset.updatedAt
                            )
                          : formatDate(asset.updatedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setDialogState({ asset, mode: "edit" })
                            }
                          >
                            <PencilLineIcon data-icon="inline-start" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setAssetToDelete(asset)}
                          >
                            <Trash2Icon data-icon="inline-start" />
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>

      <AddAssetDialog
        open={isAddDialogOpen}
        getToken={getToken}
        isPending={createProviderAssetMutation.isPending}
        errorMessage={
          createProviderAssetMutation.isError
            ? createProviderAssetMutation.error.message
            : null
        }
        onOpenChange={(open) => {
          setIsAddDialogOpen(open)
          if (!open) {
            createProviderAssetMutation.reset()
          }
        }}
        onAddProviderAsset={handleAddProviderAsset}
        onManualAsset={() => {
          setIsAddDialogOpen(false)
          setDialogState({ mode: "create" })
        }}
      />

      <AssetFormDialog
        open={dialogState !== null}
        mode={dialogState?.mode ?? "create"}
        asset={dialogState?.mode === "edit" ? dialogState.asset : null}
        categories={categories}
        riskProfiles={riskProfiles}
        defaultCurrency={
          (settingsQuery.data?.baseCurrency === "PKR" ? "PKR" : "USD") as
            | "USD"
            | "PKR"
        }
        isPending={saveAssetMutation.isPending}
        errorMessage={
          saveAssetMutation.isError ? saveAssetMutation.error.message : null
        }
        onOpenChange={(open) => {
          if (!open) {
            setDialogState(null)
            saveAssetMutation.reset()
          }
        }}
        onSubmit={handleSaveAsset}
      />

      <AlertDialog
        open={assetToDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAssetToDelete(null)
            deleteAssetMutation.reset()
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2Icon aria-hidden="true" />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete asset</AlertDialogTitle>
            <AlertDialogDescription>
              {assetToDelete
                ? `Delete ${assetToDelete.name}? This will remove the asset record but will not delete any linked transactions.`
                : "Delete this asset?"}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {deleteAssetMutation.isError ? (
            <Alert variant="destructive">
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>Delete failed</AlertTitle>
              <AlertDescription>
                {deleteAssetMutation.error.message}
              </AlertDescription>
            </Alert>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteAssetMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteAssetMutation.isPending}
              onClick={async (event) => {
                event.preventDefault()
                await handleDeleteAsset()
              }}
            >
              {deleteAssetMutation.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Trash2Icon data-icon="inline-start" />
              )}
              Delete asset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  )
}

function SummaryCard({
  detail,
  label,
  value,
}: {
  readonly detail: string
  readonly label: string
  readonly value: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <CardDescription>{detail}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="font-mono text-2xl font-semibold tracking-normal">{value}</p>
      </CardContent>
    </Card>
  )
}

function AssetsTableSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1fr)] gap-3"
        >
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
        </div>
      ))}
    </div>
  )
}
