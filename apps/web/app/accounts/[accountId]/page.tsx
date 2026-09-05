import { TransactionsPage } from "@/features/transactions/transactions-page"

export default async function AccountDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly accountId: string }>
}) {
  const { accountId } = await params

  return <TransactionsPage accountId={accountId} />
}
