import { redirect } from "next/navigation"

export default async function InvestmentsRoute({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = new URLSearchParams()
  const values = await searchParams
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "string") params.set(key, value)
  }
  redirect(params.size ? `/stocks?${params}` : "/stocks")
}
