import type { Asset, AssetCategory, RiskProfile } from "./asset-types"

interface GetToken {
  (): Promise<string | null>
}

interface ApiErrorPayload {
  readonly error?: {
    readonly code?: string
    readonly details?: Record<string, unknown>
    readonly message?: string
  }
}

export class ApiClientError extends Error {
  readonly code: string | null
  readonly details: Record<string, unknown> | null
  readonly status: number

  constructor({
    code,
    details,
    message,
    status,
  }: {
    readonly code: string | null
    readonly details: Record<string, unknown> | null
    readonly message: string
    readonly status: number
  }) {
    super(message)
    this.code = code
    this.details = details
    this.name = "ApiClientError"
    this.status = status
  }
}

interface AssetItemResponse {
  readonly data: Asset
}

interface AssetsListResponse {
  readonly data: readonly Asset[]
  readonly meta: {
    readonly total: number
  }
}

interface AssetMetadataResponse {
  readonly data: {
    readonly categories: readonly AssetCategory[]
    readonly riskProfiles: readonly RiskProfile[]
  }
}

export const assetsQueryKey = ["assets"] as const
export const assetMetadataQueryKey = ["assets", "metadata"] as const

export async function getAssetMetadata(
  getToken: GetToken
): Promise<{ readonly categories: readonly AssetCategory[]; readonly riskProfiles: readonly RiskProfile[] }> {
  const response = await apiRequest<AssetMetadataResponse>(
    getToken,
    "/api/v1/assets/metadata"
  )

  return response.data
}

export async function listAssets(getToken: GetToken): Promise<readonly Asset[]> {
  const response = await apiRequest<AssetsListResponse>(getToken, "/api/v1/assets")

  return response.data
}

export async function createAsset(
  getToken: GetToken,
  payload: AssetPayload
): Promise<Asset> {
  const response = await apiRequest<AssetItemResponse>(getToken, "/api/v1/assets", {
    body: JSON.stringify(payload),
    method: "POST",
  })

  return response.data
}

export async function updateAsset(
  getToken: GetToken,
  assetId: string,
  payload: AssetPayload
): Promise<Asset> {
  const response = await apiRequest<AssetItemResponse>(
    getToken,
    `/api/v1/assets/${assetId}`,
    {
      body: JSON.stringify(payload),
      method: "PATCH",
    }
  )

  return response.data
}

export async function deleteAsset(
  getToken: GetToken,
  assetId: string
): Promise<void> {
  await apiRequest(getToken, `/api/v1/assets/${assetId}`, {
    method: "DELETE",
  })
}

export type AssetPayload = {
  readonly name: string
  readonly symbol?: string
  readonly categoryId: string
  readonly riskProfileId?: string
  readonly currentPrice?: string
  readonly priceCurrency?: string
  readonly notes?: string
}

async function apiRequest<T>(
  getToken: GetToken,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = await getToken()

  if (!token) {
    throw new Error("Unable to read the active Clerk session token.")
  }

  const response = await fetch(`${getPublicApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  })

  if (!response.ok) {
    throw await toApiClientError(response)
  }

  return (await response.json()) as T
}

function getPublicApiBaseUrl(): string {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL

  if (!apiBaseUrl) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL is required for authenticated asset requests."
    )
  }

  return apiBaseUrl.replace(/\/$/, "")
}

async function toApiClientError(response: Response): Promise<ApiClientError> {
  let payload: ApiErrorPayload | null = null

  try {
    payload = (await response.json()) as ApiErrorPayload
  } catch {
    payload = null
  }

  return new ApiClientError({
    code: payload?.error?.code ?? null,
    details: payload?.error?.details ?? null,
    message:
      payload?.error?.message ??
      `Request failed with status ${response.status}.`,
    status: response.status,
  })
}
