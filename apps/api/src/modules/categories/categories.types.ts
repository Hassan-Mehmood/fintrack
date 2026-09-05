import type { TransactionType } from '../../generated/prisma/enums';

export type TransactionCategories = Readonly<
  Record<TransactionType, readonly string[]>
>;

export interface CategoriesResponse {
  readonly data: TransactionCategories;
}
