import type { AccountType } from '../../generated/prisma/enums';

export interface AccountResponse {
  readonly id: string;
  readonly name: string;
  readonly type: AccountType;
  readonly currency: string;
  readonly openingBalance: string;
  readonly currentBalance: string;
  readonly openedAt: string;
  readonly archivedAt: string | null;
  readonly transactionCount: number;
  readonly canDelete: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AccountsListResponse {
  readonly data: readonly AccountResponse[];
  readonly meta: {
    readonly total: number;
  };
}

export interface AccountItemResponse {
  readonly data: AccountResponse;
}

export interface DeleteAccountResponse {
  readonly data: {
    readonly id: string;
    readonly deleted: true;
  };
}
