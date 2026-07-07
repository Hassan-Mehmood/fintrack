import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';
import {
  createAccountNotFoundForTransactionException,
  createInvalidTransferException,
  createTransactionLockedException,
  createTransactionNotFoundException,
  createTransactionNotReversibleException,
} from './transactions.errors';
import type { CreateTransactionDto } from './dto/create-transaction.dto';
import type { UpdateTransactionDto } from './dto/update-transaction.dto';
import type { TransactionResponse } from './transactions.types';

const transactionSelect = {
  id: true,
  type: true,
  accountId: true,
  account: {
    select: {
      name: true,
      currency: true,
    },
  },
  destinationAccountId: true,
  destinationAccount: {
    select: {
      name: true,
    },
  },
  reversalOfId: true,
  reversal: {
    select: {
      id: true,
    },
  },
  amount: true,
  currency: true,
  occurredAt: true,
  description: true,
  merchant: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TransactionSelect;

type TransactionRecord = Prisma.TransactionGetPayload<{
  select: typeof transactionSelect;
}>;

const reversibleTypes = new Set<string>([
  'INCOME',
  'EXPENSE',
  'REFUND',
  'FEE',
  'INVESTMENT_BUY',
  'INVESTMENT_SELL',
]);

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listTransactionsForUser(
    user: AuthenticatedUser,
  ): Promise<readonly TransactionResponse[]> {
    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId: user.id,
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      select: transactionSelect,
    });

    return transactions.map((transaction) =>
      this.toTransactionResponse(transaction),
    );
  }

  async getTransactionForUser(
    user: AuthenticatedUser,
    transactionId: string,
  ): Promise<TransactionResponse> {
    const transaction = await this.findOwnedTransactionOrThrow(
      user.id,
      transactionId,
    );

    return this.toTransactionResponse(transaction);
  }

  async createTransactionForUser(
    user: AuthenticatedUser,
    payload: CreateTransactionDto,
  ): Promise<TransactionResponse> {
    await this.validateTransactionAccounts(user.id, payload);

    const transaction = await this.prisma.transaction.create({
      data: {
        userId: user.id,
        type: payload.type,
        accountId: payload.accountId,
        destinationAccountId: payload.destinationAccountId,
        amount: normalizeAmount(payload.amount, payload.type),
        currency: payload.currency,
        occurredAt: new Date(payload.occurredAt),
        description: payload.description,
        merchant: payload.merchant,
        notes: payload.notes,
      },
      select: transactionSelect,
    });

    return this.toTransactionResponse(transaction);
  }

  async updateTransactionForUser(
    user: AuthenticatedUser,
    transactionId: string,
    payload: UpdateTransactionDto,
  ): Promise<TransactionResponse> {
    const existingTransaction = await this.findOwnedTransactionOrThrow(
      user.id,
      transactionId,
    );

    this.assertTransactionIsMutable(existingTransaction);

    const effectiveType = payload.type ?? existingTransaction.type;
    const effectiveAccountId =
      payload.accountId ?? existingTransaction.accountId;
    const effectiveDestinationAccountId =
      payload.destinationAccountId ?? existingTransaction.destinationAccountId;

    await this.validateTransactionAccounts(user.id, {
      type: effectiveType,
      accountId: effectiveAccountId,
      destinationAccountId: effectiveDestinationAccountId ?? undefined,
    });

    const transaction = await this.prisma.transaction.update({
      where: {
        id: transactionId,
      },
      data: {
        type: payload.type,
        accountId: payload.accountId,
        destinationAccountId: payload.destinationAccountId,
        amount:
          payload.amount !== undefined
            ? normalizeAmount(payload.amount, effectiveType)
            : undefined,
        currency: payload.currency,
        occurredAt: payload.occurredAt
          ? new Date(payload.occurredAt)
          : undefined,
        description: payload.description,
        merchant: payload.merchant,
        notes: payload.notes,
      },
      select: transactionSelect,
    });

    return this.toTransactionResponse(transaction);
  }

  async reverseTransactionForUser(
    user: AuthenticatedUser,
    transactionId: string,
  ): Promise<TransactionResponse> {
    const originalTransaction = await this.findOwnedTransactionOrThrow(
      user.id,
      transactionId,
    );

    if (!reversibleTypes.has(originalTransaction.type)) {
      throw createTransactionNotReversibleException(transactionId);
    }

    this.assertTransactionIsMutable(originalTransaction);

    const reversalAmount = negateAmount(originalTransaction.amount.toString());

    const [reversal] = await this.prisma.$transaction([
      this.prisma.transaction.create({
        data: {
          userId: user.id,
          type: originalTransaction.type,
          accountId: originalTransaction.accountId,
          destinationAccountId: originalTransaction.destinationAccountId,
          reversalOfId: originalTransaction.id,
          amount: reversalAmount,
          currency: originalTransaction.currency,
          occurredAt: new Date(),
          description: `Reversal: ${originalTransaction.description}`,
          merchant: originalTransaction.merchant,
          notes: 'Reversal of transaction ' + originalTransaction.id,
        },
        select: transactionSelect,
      }),
    ]);

    return this.toTransactionResponse(reversal);
  }

  async deleteTransactionForUser(
    user: AuthenticatedUser,
    transactionId: string,
  ): Promise<void> {
    const transaction = await this.findOwnedTransactionOrThrow(
      user.id,
      transactionId,
    );

    this.assertTransactionIsMutable(transaction);

    await this.prisma.transaction.delete({
      where: {
        id: transactionId,
      },
    });
  }

  private assertTransactionIsMutable(transaction: TransactionRecord): void {
    if (transaction.reversalOfId || transaction.reversal) {
      throw createTransactionLockedException(transaction.id);
    }
  }

  private async findOwnedTransactionOrThrow(
    userId: string,
    transactionId: string,
  ): Promise<TransactionRecord> {
    const transaction = await this.prisma.transaction.findFirst({
      where: {
        id: transactionId,
        userId,
      },
      select: transactionSelect,
    });

    if (!transaction) {
      throw createTransactionNotFoundException(transactionId);
    }

    return transaction;
  }

  private async validateTransactionAccounts(
    userId: string,
    payload: {
      readonly type: string;
      readonly accountId: string;
      readonly destinationAccountId?: string;
    },
  ): Promise<void> {
    const account = await this.prisma.account.findFirst({
      where: {
        id: payload.accountId,
        userId,
      },
      select: {
        id: true,
      },
    });

    if (!account) {
      throw createAccountNotFoundForTransactionException(payload.accountId);
    }

    if (payload.type === 'TRANSFER') {
      if (!payload.destinationAccountId) {
        throw createInvalidTransferException(
          'Transfers require a destination account.',
        );
      }

      if (payload.destinationAccountId === payload.accountId) {
        throw createInvalidTransferException(
          'The destination account must be different from the source account.',
        );
      }

      const destinationAccount = await this.prisma.account.findFirst({
        where: {
          id: payload.destinationAccountId,
          userId,
        },
        select: {
          id: true,
        },
      });

      if (!destinationAccount) {
        throw createAccountNotFoundForTransactionException(
          payload.destinationAccountId,
        );
      }
    }
  }

  private toTransactionResponse(
    transaction: TransactionRecord,
  ): TransactionResponse {
    return {
      id: transaction.id,
      type: transaction.type,
      accountId: transaction.accountId,
      accountName: transaction.account.name,
      accountCurrency: transaction.account.currency,
      destinationAccountId: transaction.destinationAccountId,
      destinationAccountName: transaction.destinationAccount?.name ?? null,
      reversalOfId: transaction.reversalOfId,
      reversedById: transaction.reversal?.id ?? null,
      amount: transaction.amount.toString(),
      currency: transaction.currency,
      occurredAt: transaction.occurredAt.toISOString(),
      description: transaction.description,
      merchant: transaction.merchant,
      notes: transaction.notes,
      createdAt: transaction.createdAt.toISOString(),
      updatedAt: transaction.updatedAt.toISOString(),
    };
  }
}

function normalizeAmount(amount: string, type: string): string {
  if (type === 'ADJUSTMENT') {
    return amount;
  }

  return amount.startsWith('-') ? amount.slice(1) : amount;
}

function negateAmount(amount: string): string {
  return amount.startsWith('-') ? amount.slice(1) : `-${amount}`;
}
