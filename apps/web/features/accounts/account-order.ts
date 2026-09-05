export function moveAccountId(
  accountIds: readonly string[],
  accountId: string,
  targetIndex: number,
): readonly string[] {
  const currentIndex = accountIds.indexOf(accountId)
  if (
    currentIndex < 0 ||
    targetIndex < 0 ||
    targetIndex >= accountIds.length ||
    currentIndex === targetIndex
  ) {
    return accountIds
  }

  const reordered = [...accountIds]
  const [movedAccountId] = reordered.splice(currentIndex, 1)
  if (!movedAccountId) return accountIds
  reordered.splice(targetIndex, 0, movedAccountId)
  return reordered
}
