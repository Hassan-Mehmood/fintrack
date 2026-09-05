import type {
  TransactionCategories,
  TransactionType,
} from "@/features/transactions/transaction-types"

interface GetToken {
  (): Promise<string | null>
}

export const categoriesQueryKey = ["transaction-categories"] as const

export async function listTransactionCategories(
  getToken: GetToken,
): Promise<TransactionCategories> {
  const token = await getToken()
  if (!token) throw new Error("Unable to read the active Clerk session token.")

  const response = await fetch(`${getPublicApiBaseUrl()}/api/v1/categories`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    throw new Error(
      `Unable to load transaction categories (${response.status}).`,
    )
  }

  const payload = (await response.json()) as {
    readonly data: Record<TransactionType, readonly string[]>
  }
  return payload.data
}

function getPublicApiBaseUrl(): string {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL
  if (!apiBaseUrl) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL is required for authenticated category requests.",
    )
  }
  return apiBaseUrl.replace(/\/$/, "")
}
