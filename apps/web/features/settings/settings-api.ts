interface GetToken {
  (): Promise<string | null>
}

interface SettingsResponse {
  readonly data: {
    readonly baseCurrency: string
    readonly exchangeRate: string | null
    readonly exchangeRateSource: string
    readonly exchangeRateUpdatedAt: string | null
  }
}

export const settingsQueryKey = ["settings"] as const

export async function getSettings(
  getToken: GetToken,
): Promise<SettingsResponse["data"]> {
  const token = await getToken()

  if (!token) {
    throw new Error("Unable to read the active Clerk session token.")
  }

  const apiBaseUrl = getPublicApiBaseUrl()

  const response = await fetch(`${apiBaseUrl}/api/v1/users/me/settings`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    throw new Error("Failed to fetch settings.")
  }

  const payload = (await response.json()) as SettingsResponse
  return payload.data
}

interface UpdateSettingsPayload {
  readonly baseCurrency?: string
  readonly exchangeRate?: string
}

export async function updateSettings(
  getToken: GetToken,
  payload: UpdateSettingsPayload,
): Promise<SettingsResponse["data"]> {
  const token = await getToken()

  if (!token) {
    throw new Error("Unable to read the active Clerk session token.")
  }

  const apiBaseUrl = getPublicApiBaseUrl()

  const response = await fetch(`${apiBaseUrl}/api/v1/users/me/settings`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(
      body?.error?.message ?? "Failed to update settings.",
    )
  }

  const result = (await response.json()) as SettingsResponse
  return result.data
}

function getPublicApiBaseUrl(): string {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL

  if (!apiBaseUrl) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL is required for authenticated settings requests.",
    )
  }

  return apiBaseUrl.replace(/\/$/, "")
}
