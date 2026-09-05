import type { Account, AccountPayload } from "./account-types"

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

interface AccountItemResponse {
  readonly data: Account
}

interface AccountsListResponse {
  readonly data: readonly Account[]
  readonly meta: {
    readonly total: number
  }
}

export const accountsQueryKey = ["accounts"] as const
export const accountQueryKey = (accountId: string) =>
  [...accountsQueryKey, accountId] as const

export async function listAccounts(
  getToken: GetToken,
): Promise<readonly Account[]> {
  const response = await apiRequest<AccountsListResponse>(
    getToken,
    "/api/v1/accounts",
  )

  return response.data
}

export async function getAccount(
  getToken: GetToken,
  accountId: string,
): Promise<Account> {
  const response = await apiRequest<AccountItemResponse>(
    getToken,
    `/api/v1/accounts/${accountId}`,
  )
  return response.data
}

export async function createAccount(
  getToken: GetToken,
  payload: AccountPayload,
): Promise<Account> {
  const response = await apiRequest<AccountItemResponse>(
    getToken,
    "/api/v1/accounts",
    {
      body: JSON.stringify(payload),
      method: "POST",
    },
  )

  return response.data
}

export async function updateAccount(
  getToken: GetToken,
  accountId: string,
  payload: AccountPayload,
): Promise<Account> {
  const response = await apiRequest<AccountItemResponse>(
    getToken,
    `/api/v1/accounts/${accountId}`,
    {
      body: JSON.stringify(payload),
      method: "PATCH",
    },
  )

  return response.data
}

export async function adjustAccountBalance(
  getToken: GetToken,
  accountId: string,
  payload: {
    readonly currentBalance: string
    readonly expectedBalance: string
    readonly currency: string
    readonly idempotencyKey: string
  },
): Promise<Account> {
  const response = await apiRequest<AccountItemResponse>(
    getToken,
    `/api/v1/accounts/${accountId}/balance-adjustments`,
    { body: JSON.stringify(payload), method: "POST" },
  )
  return response.data
}

export async function deleteAccount(
  getToken: GetToken,
  accountId: string,
): Promise<void> {
  await apiRequest(getToken, `/api/v1/accounts/${accountId}`, {
    method: "DELETE",
  })
}

async function apiRequest<T>(
  getToken: GetToken,
  path: string,
  init: RequestInit = {},
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
      "NEXT_PUBLIC_API_BASE_URL is required for authenticated account requests.",
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
