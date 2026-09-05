import type {
  BulkTransactionPayload,
  Transaction,
  TransactionListParams,
  TransactionPayload,
  TransactionsListResult,
  AccountTransactionsListResult,
} from "./transaction-types"

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

interface TransactionItemResponse {
  readonly data: Transaction
}

export const transactionsQueryKey = ["transactions"] as const

export async function listTransactions(
  getToken: GetToken,
  params: TransactionListParams = {},
): Promise<TransactionsListResult> {
  return apiRequest<TransactionsListResult>(
    getToken,
    `/api/v1/transactions?${buildListQuery(params)}`,
  )
}

export async function listAccountTransactions(
  getToken: GetToken,
  accountId: string,
  params: TransactionListParams = {},
): Promise<AccountTransactionsListResult> {
  return apiRequest<AccountTransactionsListResult>(
    getToken,
    `/api/v1/accounts/${accountId}/transactions?${buildListQuery(params)}`,
  )
}

export async function getTransaction(
  getToken: GetToken,
  transactionId: string,
): Promise<Transaction> {
  const response = await apiRequest<TransactionItemResponse>(
    getToken,
    `/api/v1/transactions/${transactionId}`,
  )

  return response.data
}

export async function createTransaction(
  getToken: GetToken,
  payload: TransactionPayload,
): Promise<Transaction> {
  const response = await apiRequest<TransactionItemResponse>(
    getToken,
    "/api/v1/transactions",
    {
      body: JSON.stringify(payload),
      method: "POST",
    },
  )

  return response.data
}

export async function updateTransaction(
  getToken: GetToken,
  transactionId: string,
  payload: TransactionPayload,
): Promise<Transaction> {
  const response = await apiRequest<TransactionItemResponse>(
    getToken,
    `/api/v1/transactions/${transactionId}`,
    {
      body: JSON.stringify(payload),
      method: "PATCH",
    },
  )

  return response.data
}

export async function deleteTransaction(
  getToken: GetToken,
  transactionId: string,
): Promise<void> {
  await apiRequest(getToken, `/api/v1/transactions/${transactionId}`, {
    method: "DELETE",
  })
}

export async function reverseTransaction(
  getToken: GetToken,
  transactionId: string,
): Promise<Transaction> {
  const response = await apiRequest<TransactionItemResponse>(
    getToken,
    `/api/v1/transactions/${transactionId}/reverse`,
    {
      method: "POST",
    },
  )

  return response.data
}

export async function bulkUpdateTransactions(
  getToken: GetToken,
  payload: BulkTransactionPayload,
): Promise<readonly string[]> {
  const response = await apiRequest<{
    readonly data: { readonly updatedIds: readonly string[] }
  }>(getToken, "/api/v1/transactions/bulk", {
    body: JSON.stringify(payload),
    method: "PATCH",
  })

  return response.data.updatedIds
}

function buildListQuery(params: TransactionListParams): string {
  const query = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === "") {
      return
    }

    if (Array.isArray(value)) {
      if (value.length > 0) {
        query.set(key, value.join(","))
      }
      return
    }

    query.set(key, String(value))
  })

  return query.toString()
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
      "NEXT_PUBLIC_API_BASE_URL is required for authenticated transaction requests.",
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
