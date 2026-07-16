import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { TradeType } from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';
import {
  createAccountNotFoundForTransactionException,
  createAssetNotFoundForTransactionException,
  createInvalidInvestmentAmountException,
  createInvalidInvestmentTradeTypeException,
  createInvalidTransferException,
  createInvestmentDetailRequiredException,
  createTransactionCurrencyMismatchException,
  createTransactionLockedException,
  createTransactionNotFoundException,
  createTransactionNotReversibleException,
} from './transactions.errors';
import type { CreateTransactionDto } from './dto/create-transaction.dto';
import type { UpdateTransactionDto } from './dto/update-transaction.dto';
import type {
  InvestmentTransactionDetailResponse,
  TransactionResponse,
} from './transactions.types';

const investmentDetailSelect = {
  id: true,
  assetId: true,
  asset: {
    select: {
      name: true,
      symbol: true,
    },
  },
  tradeType: true,
  quantity: true,
  price: true,
  fees: true,
  notes: true,
} satisfies Prisma.InvestmentTransactionDetailSelect;

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
  investmentDetail: {
    select: investmentDetailSelect,
  },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TransactionSelect;

type TransactionRecord = Prisma.TransactionGetPayload<{
  select: typeof transactionSelect;
}>;

const investmentTypes = new Set<string>(['INVESTMENT_BUY', 'INVESTMENT_SELL']);

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
    await this.validateTransactionAccounts(user.id, {
      ...payload,
      currency: payload.currency,
    });

    if (investmentTypes.has(payload.type)) {
      this.validateInvestmentPayload(payload.type, payload.investment);
      await this.validateInvestmentAsset(user.id, payload.investment!.assetId);
    }

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
        investmentDetail: payload.investment
          ? {
              create: {
                assetId: payload.investment.assetId,
                tradeType: payload.investment.tradeType,
                quantity: payload.investment.quantity,
                price: payload.investment.price,
                fees: payload.investment.fees ?? '0',
                notes: payload.investment.notes,
              },
            }
          : undefined,
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
    const effectiveCurrency = payload.currency ?? existingTransaction.currency;
    const effectiveInvestment =
      payload.investment ??
      (existingTransaction.investmentDetail
        ? this.recordToInvestmentPayload(existingTransaction.investmentDetail)
        : undefined);

    await this.validateTransactionAccounts(user.id, {
      type: effectiveType,
      accountId: effectiveAccountId,
      destinationAccountId: effectiveDestinationAccountId ?? undefined,
      currency: effectiveCurrency,
    });

    if (investmentTypes.has(effectiveType)) {
      this.validateInvestmentPayload(effectiveType, effectiveInvestment);
      await this.validateInvestmentAsset(user.id, effectiveInvestment!.assetId);
    }

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
        investmentDetail: this.buildInvestmentDetailUpdatePayload(
          effectiveType,
          existingTransaction.investmentDetail,
          payload.investment,
        ),
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
          investmentDetail: originalTransaction.investmentDetail
            ? {
                create: {
                  assetId: originalTransaction.investmentDetail.assetId,
                  tradeType: originalTransaction.investmentDetail.tradeType,
                  quantity: originalTransaction.investmentDetail.quantity.toString(),
                  price: originalTransaction.investmentDetail.price.toString(),
                  fees: originalTransaction.investmentDetail.fees.toString(),
                  notes: originalTransaction.investmentDetail.notes,
                },
              }
            : undefined,
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
      readonly currency?: string;
    },
  ): Promise<void> {
    const account = await this.prisma.account.findFirst({
      where: {
        id: payload.accountId,
        userId,
      },
      select: {
        id: true,
        currency: true,
      },
    });

    if (!account) {
      throw createAccountNotFoundForTransactionException(payload.accountId);
    }

    if (
      payload.currency !== undefined &&
      payload.currency !== account.currency
    ) {
      throw createTransactionCurrencyMismatchException(
        account.currency,
        payload.currency,
      );
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

  private validateInvestmentPayload(
    type: string,
    investment:
      | {
          readonly assetId: string;
          readonly tradeType: string;
          readonly quantity: string;
          readonly price: string;
          readonly fees?: string;
        }
      | undefined,
  ): void {
    if (!investment) {
      throw createInvestmentDetailRequiredException(type);
    }

    const expectedTradeType = type === 'INVESTMENT_BUY' ? 'BUY' : 'SELL';
    if (investment.tradeType !== expectedTradeType) {
      throw createInvalidInvestmentTradeTypeException(
        expectedTradeType,
        investment.tradeType,
      );
    }

    const quantity = new Prisma.Decimal(investment.quantity);
    if (quantity.isZero() || quantity.isNegative()) {
      throw createInvalidInvestmentAmountException(
        'Quantity must be greater than zero.',
      );
    }

    const price = new Prisma.Decimal(investment.price);
    if (price.isZero() || price.isNegative()) {
      throw createInvalidInvestmentAmountException(
        'Price must be greater than zero.',
      );
    }

    if (investment.fees !== undefined) {
      const fees = new Prisma.Decimal(investment.fees);
      if (fees.isNegative()) {
        throw createInvalidInvestmentAmountException(
          'Fees cannot be negative.',
        );
      }
    }
  }

  private async validateInvestmentAsset(
    userId: string,
    assetId: string,
  ): Promise<void> {
    const asset = await this.prisma.asset.findFirst({
      where: {
        id: assetId,
        userId,
      },
      select: {
        id: true,
      },
    });

    if (!asset) {
      throw createAssetNotFoundForTransactionException(assetId);
    }
  }

  private buildInvestmentDetailUpdatePayload(
    effectiveType: string,
    existingDetail: TransactionRecord['investmentDetail'],
    payloadInvestment:
      | {
          readonly assetId: string;
          readonly tradeType: string;
          readonly quantity: string;
          readonly price: string;
          readonly fees?: string;
          readonly notes?: string;
        }
      | undefined,
  ):
    | {
        create?: Prisma.InvestmentTransactionDetailCreateWithoutTransactionInput;
        update?: Prisma.InvestmentTransactionDetailUpdateWithoutTransactionInput;
        delete?: true;
      }
    | undefined {
    if (!investmentTypes.has(effectiveType)) {
      if (existingDetail) {
        return { delete: true };
      }

      return undefined;
    }

    if (!payloadInvestment) {
      return undefined;
    }

    const detailData = {
      asset: {
        connect: {
          id: payloadInvestment.assetId,
        },
      },
      tradeType: payloadInvestment.tradeType as TradeType,
      quantity: payloadInvestment.quantity,
      price: payloadInvestment.price,
      fees: payloadInvestment.fees ?? '0',
      notes: payloadInvestment.notes,
    };

    if (existingDetail) {
      return { update: detailData };
    }

    return { create: detailData };
  }

  private recordToInvestmentPayload(
    detail: TransactionRecord['investmentDetail'],
  ):
    | {
        readonly assetId: string;
        readonly tradeType: string;
        readonly quantity: string;
        readonly price: string;
        readonly fees?: string;
        readonly notes?: string;
      }
    | undefined {
    if (!detail) {
      return undefined;
    }

    return {
      assetId: detail.assetId,
      tradeType: detail.tradeType,
      quantity: detail.quantity.toString(),
      price: detail.price.toString(),
      fees: detail.fees.toString(),
      notes: detail.notes ?? undefined,
    };
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
      investmentDetail: transaction.investmentDetail
        ? this.toInvestmentDetailResponse(transaction.investmentDetail)
        : null,
      createdAt: transaction.createdAt.toISOString(),
      updatedAt: transaction.updatedAt.toISOString(),
    };
  }

  private toInvestmentDetailResponse(
    detail: Prisma.InvestmentTransactionDetailGetPayload<{
      select: typeof investmentDetailSelect;
    }>,
  ): InvestmentTransactionDetailResponse {
    return {
      id: detail.id,
      assetId: detail.assetId,
      assetName: detail.asset.name,
      assetSymbol: detail.asset.symbol,
      tradeType: detail.tradeType,
      quantity: detail.quantity.toString(),
      price: detail.price.toString(),
      fees: detail.fees.toString(),
      notes: detail.notes,
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
