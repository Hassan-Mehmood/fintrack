import type {
  TransactionListParams,
  TransactionStatus,
  TransactionType,
} from "./transaction-types";

export const datePresetOptions = [
  { value: "thisWeek", label: "This week" },
  { value: "thisMonth", label: "This month" },
  { value: "lastMonth", label: "Last month" },
  { value: "thisYear", label: "This year" },
  { value: "last7Days", label: "Last 7 days" },
  { value: "last30Days", label: "Last 30 days" },
  { value: "custom", label: "Custom range" },
  { value: "allTime", label: "All time" },
] as const;

export type DatePreset = (typeof datePresetOptions)[number]["value"];

export interface TransactionFilters {
  readonly search: string;
  readonly datePreset: DatePreset;
  readonly customFrom: string;
  readonly customTo: string;
  readonly accountIds: readonly string[];
  readonly types: readonly TransactionType[];
  readonly categories: readonly string[];
  readonly labels: readonly string[];
  readonly statuses: readonly TransactionStatus[];
  readonly direction: "IN" | "OUT" | "";
  readonly minAmount: string;
  readonly maxAmount: string;
  readonly currencies: readonly string[];
  readonly hasNote: boolean | undefined;
  readonly uncategorizedOnly: boolean;
  readonly sortBy: NonNullable<TransactionListParams["sortBy"]>;
  readonly sortDirection: "asc" | "desc";
  readonly page: number;
  readonly pageSize: 25 | 50 | 100;
}

interface SearchParamsReader {
  get(name: string): string | null;
}

export function readTransactionFilters(
  searchParams: SearchParamsReader,
): TransactionFilters {
  const pageSizeValue = Number(searchParams.get("pageSize"));
  const pageSize =
    pageSizeValue === 50 || pageSizeValue === 100 ? pageSizeValue : 25;
  const sortByValue = searchParams.get("sortBy");
  const validSortValues: TransactionFilters["sortBy"][] = [
    "date",
    "amount",
    "description",
    "account",
    "category",
    "createdAt",
  ];

  return {
    search: searchParams.get("search") ?? "",
    datePreset: readDatePreset(searchParams.get("date")),
    customFrom: searchParams.get("from") ?? "",
    customTo: searchParams.get("to") ?? "",
    accountIds: readCsv(searchParams.get("accounts")),
    types: readCsv(searchParams.get("types")) as TransactionType[],
    categories: readCsv(searchParams.get("categories")),
    labels: readCsv(searchParams.get("labels")),
    statuses: readCsv(searchParams.get("statuses")) as TransactionStatus[],
    direction:
      searchParams.get("direction") === "IN" ||
      searchParams.get("direction") === "OUT"
        ? (searchParams.get("direction") as "IN" | "OUT")
        : "",
    minAmount: searchParams.get("minAmount") ?? "",
    maxAmount: searchParams.get("maxAmount") ?? "",
    currencies: readCsv(searchParams.get("currencies")),
    hasNote:
      searchParams.get("hasNote") === "true"
        ? true
        : searchParams.get("hasNote") === "false"
          ? false
          : undefined,
    uncategorizedOnly: searchParams.get("uncategorized") === "true",
    sortBy: validSortValues.includes(
      sortByValue as TransactionFilters["sortBy"],
    )
      ? (sortByValue as TransactionFilters["sortBy"])
      : "date",
    sortDirection: searchParams.get("sortDirection") === "asc" ? "asc" : "desc",
    page: Math.max(1, Number(searchParams.get("page")) || 1),
    pageSize,
  };
}

export function toTransactionListParams(
  filters: TransactionFilters,
  debouncedSearch: string,
): TransactionListParams {
  const dateRange = getDateRange(filters);

  return {
    search: debouncedSearch || undefined,
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
    accountIds: filters.accountIds,
    types: filters.types,
    categories: filters.categories,
    labels: filters.labels,
    statuses: filters.statuses,
    direction: filters.direction || undefined,
    minAmount: filters.minAmount || undefined,
    maxAmount: filters.maxAmount || undefined,
    currencies: filters.currencies,
    hasNote: filters.hasNote,
    uncategorizedOnly: filters.uncategorizedOnly || undefined,
    sortBy: filters.sortBy,
    sortDirection: filters.sortDirection,
    page: filters.page,
    pageSize: filters.pageSize,
  };
}

export function writeTransactionFilter(
  current: URLSearchParams,
  key: string,
  value: string | readonly string[] | boolean | undefined,
): URLSearchParams {
  const next = new URLSearchParams(current);

  if (
    value === undefined ||
    value === "" ||
    value === false ||
    (Array.isArray(value) && value.length === 0)
  ) {
    next.delete(key);
  } else {
    next.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }

  if (key !== "page") {
    next.delete("page");
  }

  return next;
}

export function clearTransactionFilters(): URLSearchParams {
  const params = new URLSearchParams();
  params.set("date", "thisMonth");
  return params;
}

export function getDatePresetLabel(preset: DatePreset): string {
  return (
    datePresetOptions.find((option) => option.value === preset)?.label ?? preset
  );
}

function getDateRange(filters: TransactionFilters): {
  readonly from?: string;
  readonly to?: string;
} {
  const now = new Date();
  let from: Date | undefined;
  let to: Date | undefined;

  switch (filters.datePreset) {
    case "thisWeek": {
      const day = now.getDay();
      const daysSinceMonday = day === 0 ? 6 : day - 1;
      from = addDays(startOfDay(now), -daysSinceMonday);
      to = endOfDay(now);
      break;
    }
    case "thisMonth":
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      to = endOfDay(now);
      break;
    case "lastMonth":
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      to = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
      break;
    case "thisYear":
      from = new Date(now.getFullYear(), 0, 1);
      to = endOfDay(now);
      break;
    case "last7Days":
      from = addDays(startOfDay(now), -6);
      to = endOfDay(now);
      break;
    case "last30Days":
      from = addDays(startOfDay(now), -29);
      to = endOfDay(now);
      break;
    case "custom":
      from = filters.customFrom
        ? startOfDay(new Date(`${filters.customFrom}T00:00:00`))
        : undefined;
      to = filters.customTo
        ? endOfDay(new Date(`${filters.customTo}T00:00:00`))
        : undefined;
      break;
    case "allTime":
      break;
  }

  return {
    from: from?.toISOString(),
    to: to?.toISOString(),
  };
}

function readDatePreset(value: string | null): DatePreset {
  return datePresetOptions.some((option) => option.value === value)
    ? (value as DatePreset)
    : "thisMonth";
}

function readCsv(value: string | null): string[] {
  return value ? value.split(",").filter(Boolean) : [];
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function endOfDay(value: Date): Date {
  return new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
    23,
    59,
    59,
    999,
  );
}

function addDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
}
