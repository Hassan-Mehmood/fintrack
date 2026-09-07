import type {
  Holding,
  HoldingGroupBy,
  InvestmentFilters,
  InvestmentSummary,
  ReportingCurrency,
  CreatePositionPayload,
  PositionCommandResult,
} from "./investment-types";

interface GetToken {
  (): Promise<string | null>;
}

interface ApiErrorPayload {
  readonly error?: {
    readonly code?: string;
    readonly details?: Record<string, unknown>;
    readonly message?: string;
  };
}

export class ApiClientError extends Error {
  readonly code: string | null;
  readonly details: Record<string, unknown> | null;
  readonly status: number;

  constructor({
    code,
    details,
    message,
    status,
  }: {
    readonly code: string | null;
    readonly details: Record<string, unknown> | null;
    readonly message: string;
    readonly status: number;
  }) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = "ApiClientError";
    this.status = status;
  }
}

interface HoldingsListResponse {
  readonly data: readonly Holding[];
}

interface InvestmentSummaryResponse {
  readonly data: InvestmentSummary;
}

export const holdingsQueryKey = ["investments", "holdings"] as const;
export const investmentSummaryQueryKey = ["investments", "summary"] as const;

export async function createPosition(
  getToken: GetToken,
  payload: CreatePositionPayload,
): Promise<PositionCommandResult> {
  const response = await apiRequest<{
    readonly data: PositionCommandResult;
  }>(getToken, "/api/v1/investments/positions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return response.data;
}

export interface InvestmentAccountSummary {
  readonly accountId: string;
  readonly accountCurrency: string;
  readonly reportingCurrency: string;
  readonly availableFiatCash: string;
  readonly cashEquivalentValue: string;
  readonly investedValue: string;
  readonly totalLiquidity: string | null;
  readonly totalAccountValue: string | null;
  readonly costBasis: string | null;
  readonly realizedGain: string | null;
  readonly unrealizedGain: string | null;
  readonly holdings: readonly Holding[];
}

export async function getInvestmentAccountSummary(
  getToken: GetToken,
  accountId: string,
) {
  const response = await apiRequest<{
    readonly data: InvestmentAccountSummary;
  }>(getToken, `/api/v1/investments/accounts/${accountId}/summary`);
  return response.data;
}

export async function listHoldings(
  getToken: GetToken,
  reportingCurrency: ReportingCurrency,
  filters: InvestmentFilters,
  groupBy: HoldingGroupBy = "NONE",
): Promise<readonly Holding[]> {
  const query = new URLSearchParams({
    reportingCurrency,
    groupBy,
    domain: filters.domain,
  });
  appendFilter(query, "accountId", filters.accountId);
  appendFilter(query, "portfolioId", filters.portfolioId);
  appendFilter(query, "assetType", filters.assetType);
  appendFilter(query, "currency", filters.currency);
  const response = await apiRequest<HoldingsListResponse>(
    getToken,
    `/api/v1/investments/holdings?${query.toString()}`,
  );

  return response.data;
}

export async function getInvestmentSummary(
  getToken: GetToken,
  reportingCurrency: ReportingCurrency,
  filters: InvestmentFilters,
): Promise<InvestmentSummary> {
  const query = new URLSearchParams({
    reportingCurrency,
    domain: filters.domain,
  });
  appendFilter(query, "accountId", filters.accountId);
  appendFilter(query, "portfolioId", filters.portfolioId);
  appendFilter(query, "assetType", filters.assetType);
  appendFilter(query, "currency", filters.currency);

  const response = await apiRequest<InvestmentSummaryResponse>(
    getToken,
    `/api/v1/investments/summary?${query.toString()}`,
  );

  return response.data;
}

function appendFilter(
  query: URLSearchParams,
  key: string,
  value: string | undefined,
): void {
  if (value) {
    query.set(key, value);
  }
}

async function apiRequest<T>(
  getToken: GetToken,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getToken();

  if (!token) {
    throw new Error("Unable to read the active Clerk session token.");
  }

  const response = await fetch(`${getPublicApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw await toApiClientError(response);
  }

  return (await response.json()) as T;
}

function getPublicApiBaseUrl(): string {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (!apiBaseUrl) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL is required for authenticated investment requests.",
    );
  }

  return apiBaseUrl.replace(/\/$/, "");
}

async function toApiClientError(response: Response): Promise<ApiClientError> {
  let payload: ApiErrorPayload | null = null;

  try {
    payload = (await response.json()) as ApiErrorPayload;
  } catch {
    payload = null;
  }

  return new ApiClientError({
    code: payload?.error?.code ?? null,
    details: payload?.error?.details ?? null,
    message:
      payload?.error?.message ??
      `Request failed with status ${response.status}.`,
    status: response.status,
  });
}
