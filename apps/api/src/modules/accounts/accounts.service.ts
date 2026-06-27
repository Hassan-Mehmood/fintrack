import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';
import {
  createAccountHasTransactionsException,
  createAccountNotFoundException,
} from './accounts.errors';
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
    const accounts = await this.prisma.account.findMany({
      where: {
        userId: user.id,
      },
      orderBy: [{ createdAt: 'desc' }],
      select: accountSelect,
    });

    return accounts.map((account) => this.toAccountResponse(account));
  }

  async getAccountForUser(
    user: AuthenticatedUser,
    accountId: string,
  ): Promise<AccountResponse> {
    const account = await this.findOwnedAccountOrThrow(user.id, accountId);

    return this.toAccountResponse(account);
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

    return this.toAccountResponse(account);
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

    return this.toAccountResponse(account);
  }

  async deleteAccountForUser(
    user: AuthenticatedUser,
    accountId: string,
  ): Promise<void> {
    await this.assertOwnedAccountExists(user.id, accountId);

    const transactionCount = await this.prisma.transaction.count({
      where: {
        userId: user.id,
        OR: [{ accountId }, { destinationAccountId: accountId }],
      },
    });

    if (transactionCount > 0) {
      throw createAccountHasTransactionsException(accountId);
    }

    await this.prisma.account.delete({
      where: {
        id: accountId,
      },
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

  private toAccountResponse(account: AccountRecord): AccountResponse {
    const transactionCount =
      account._count.transactions + account._count.transfersIn;

    return {
      id: account.id,
      name: account.name,
      type: account.type,
      currency: account.currency,
      openingBalance: account.openingBalance.toString(),
      openedAt: account.openedAt.toISOString(),
      archivedAt: account.archivedAt?.toISOString() ?? null,
      transactionCount,
      canDelete: transactionCount === 0,
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
    };
  }
}
