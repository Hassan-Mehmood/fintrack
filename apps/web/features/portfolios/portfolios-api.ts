import type { Portfolio, PortfolioPayload } from "./portfolio-types"

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
    this.status = status
    this.name = "ApiClientError"
  }
}

interface PortfolioItemResponse {
  readonly data: Portfolio
}

interface PortfoliosListResponse {
  readonly data: readonly Portfolio[]
  readonly meta: {
    readonly total: number
  }
}

export const portfoliosQueryKey = ["portfolios"] as const

export async function listPortfolios(
  getToken: GetToken
): Promise<readonly Portfolio[]> {
  const response = await apiRequest<PortfoliosListResponse>(
    getToken,
    "/api/v1/portfolios"
  )

  return response.data
}

export async function getPortfolio(
  getToken: GetToken,
  portfolioId: string
): Promise<Portfolio> {
  const response = await apiRequest<PortfolioItemResponse>(
    getToken,
    `/api/v1/portfolios/${portfolioId}`
  )

  return response.data
}

export async function createPortfolio(
  getToken: GetToken,
  payload: PortfolioPayload
): Promise<Portfolio> {
  const response = await apiRequest<PortfolioItemResponse>(
    getToken,
    "/api/v1/portfolios",
    {
      body: JSON.stringify(payload),
      method: "POST",
    }
  )

  return response.data
}

export async function updatePortfolio(
  getToken: GetToken,
  portfolioId: string,
  payload: PortfolioPayload
): Promise<Portfolio> {
  const response = await apiRequest<PortfolioItemResponse>(
    getToken,
    `/api/v1/portfolios/${portfolioId}`,
    {
      body: JSON.stringify(payload),
      method: "PATCH",
    }
  )

  return response.data
}

export async function deletePortfolio(
  getToken: GetToken,
  portfolioId: string
): Promise<void> {
  await apiRequest(getToken, `/api/v1/portfolios/${portfolioId}`, {
    method: "DELETE",
  })
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
      "NEXT_PUBLIC_API_BASE_URL is required for authenticated portfolio requests."
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
