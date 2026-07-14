import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { TransactionType } from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';
import { calculateAccountBalance } from '../../common/financial/transaction-effects';
import { createAccountNotFoundException } from './accounts.errors';
import type { CreateAccountDto } from './dto/create-account.dto';
import type { UpdateAccountDto } from './dto/update-account.dto';
import type { AccountResponse } from './accounts.types';

const accountSelect = {
  id: true,
  name: true,
  type: true,
  currency: true,
  openingBalance: true,
  openedAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      transactions: true,
      transfersIn: true,
    },
  },
} satisfies Prisma.AccountSelect;

type AccountRecord = Prisma.AccountGetPayload<{
  select: typeof accountSelect;
}>;

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAccountsForUser(
    user: AuthenticatedUser,
  ): Promise<readonly AccountResponse[]> {
    const [accounts, transactions] = await Promise.all([
      this.prisma.account.findMany({
        where: {
          userId: user.id,
        },
        orderBy: [{ createdAt: 'desc' }],
        select: accountSelect,
      }),
      this.prisma.transaction.findMany({
        where: {
          userId: user.id,
        },
        select: {
          type: true,
          accountId: true,
          destinationAccountId: true,
          amount: true,
        },
      }),
    ]);

    return accounts.map((account) =>
      this.toAccountResponse(account, transactions),
    );
  }

  async getAccountForUser(
    user: AuthenticatedUser,
    accountId: string,
  ): Promise<AccountResponse> {
    const account = await this.findOwnedAccountOrThrow(user.id, accountId);
    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId: user.id,
        OR: [{ accountId }, { destinationAccountId: accountId }],
      },
      select: {
        type: true,
        accountId: true,
        destinationAccountId: true,
        amount: true,
      },
    });

    return this.toAccountResponse(account, transactions);
  }

  async createAccountForUser(
    user: AuthenticatedUser,
    payload: CreateAccountDto,
  ): Promise<AccountResponse> {
    const account = await this.prisma.account.create({
      data: {
        userId: user.id,
        name: payload.name,
        type: payload.type,
        currency: payload.currency,
        openingBalance: payload.openingBalance,
        openedAt: payload.openedAt ? new Date(payload.openedAt) : undefined,
      },
      select: accountSelect,
    });

    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId: user.id,
        OR: [
          { accountId: account.id },
          { destinationAccountId: account.id },
        ],
      },
      select: {
        type: true,
        accountId: true,
        destinationAccountId: true,
        amount: true,
      },
    });

    return this.toAccountResponse(account, transactions);
  }

  async updateAccountForUser(
    user: AuthenticatedUser,
    accountId: string,
    payload: UpdateAccountDto,
  ): Promise<AccountResponse> {
    await this.assertOwnedAccountExists(user.id, accountId);

    const account = await this.prisma.account.update({
      where: {
        id: accountId,
      },
      data: {
        name: payload.name,
        type: payload.type,
        currency: payload.currency,
        openingBalance: payload.openingBalance,
        openedAt: payload.openedAt ? new Date(payload.openedAt) : undefined,
      },
      select: accountSelect,
    });

    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId: user.id,
        OR: [
          { accountId: account.id },
          { destinationAccountId: account.id },
        ],
      },
      select: {
        type: true,
        accountId: true,
        destinationAccountId: true,
        amount: true,
      },
    });

    return this.toAccountResponse(account, transactions);
  }

  async deleteAccountForUser(
    user: AuthenticatedUser,
    accountId: string,
  ): Promise<void> {
    await this.assertOwnedAccountExists(user.id, accountId);

    const transactionsToDelete = await this.prisma.transaction.findMany({
      where: {
        userId: user.id,
        OR: [{ accountId }, { destinationAccountId: accountId }],
      },
      select: {
        id: true,
        reversalOfId: true,
      },
    });

    const transactionIds = transactionsToDelete.map(
      (transaction) => transaction.id,
    );

    await this.prisma.$transaction(async (tx) => {
      // Unlink reversals that point to any transaction being deleted so
      // foreign-key constraints are not violated during the delete.
      await tx.transaction.updateMany({
        where: {
          userId: user.id,
          reversalOfId: {
            in: transactionIds,
          },
        },
        data: {
          reversalOfId: null,
        },
      });

      // Delete reversal transactions first because they reference other
      // transactions through reversalOfId.
      await tx.transaction.deleteMany({
        where: {
          userId: user.id,
          id: {
            in: transactionIds,
          },
          reversalOfId: {
            not: null,
          },
        },
      });

      // Delete the remaining transactions for this account.
      await tx.transaction.deleteMany({
        where: {
          userId: user.id,
          id: {
            in: transactionIds,
          },
        },
      });

      await tx.account.delete({
        where: {
          id: accountId,
        },
      });
    });
  }

  private async assertOwnedAccountExists(
    userId: string,
    accountId: string,
  ): Promise<void> {
    const account = await this.prisma.account.findFirst({
      where: {
        id: accountId,
        userId,
      },
      select: {
        id: true,
      },
    });

    if (!account) {
      throw createAccountNotFoundException(accountId);
    }
  }

  private async findOwnedAccountOrThrow(
    userId: string,
    accountId: string,
  ): Promise<AccountRecord> {
    const account = await this.prisma.account.findFirst({
      where: {
        id: accountId,
        userId,
      },
      select: accountSelect,
    });

    if (!account) {
      throw createAccountNotFoundException(accountId);
    }

    return account;
  }

  private toAccountResponse(
    account: AccountRecord,
    transactions: ReadonlyArray<{
      readonly type: TransactionType;
      readonly accountId: string;
      readonly destinationAccountId: string | null;
      readonly amount: Prisma.Decimal;
    }>,
  ): AccountResponse {
    const transactionCount =
      account._count.transactions + account._count.transfersIn;
    const currentBalance = calculateAccountBalance(
      account.openingBalance,
      account.id,
      transactions,
    );

    return {
      id: account.id,
      name: account.name,
      type: account.type,
      currency: account.currency,
      openingBalance: account.openingBalance.toString(),
      currentBalance: currentBalance.toString(),
      openedAt: account.openedAt.toISOString(),
      archivedAt: account.archivedAt?.toISOString() ?? null,
      transactionCount,
      canDelete: transactionCount === 0,
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
    };
  }
}
