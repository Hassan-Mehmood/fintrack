import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { TradeType, TransactionType } from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  calculateHolding,
  type InvestmentTransactionInput,
} from '../../common/financial/holdings';
import { calculateInvestmentTransactionAmounts } from '../../common/financial/investment-transaction-calculations';
import { convertUsdPkr } from '../../common/financial/fx-conversion';
import { CurrencyConverter } from '../../common/financial/currency-converter';
import { PrismaService } from '../../prisma/prisma.service';
import {
  createAccountNotFoundForTransactionException,
  createAssetNotFoundForTransactionException,
  createInsufficientHoldingException,
  createInvalidInvestmentAccountException,
  createInvalidInvestmentAmountException,
  createInvalidInvestmentTradeTypeException,
  createInvalidBulkTransactionException,
  createInvalidTransactionAmountException,
  createInvalidTransferException,
  createInvestmentDetailRequiredException,
  createTransactionCurrencyMismatchException,
  createTransactionLockedException,
  createTransactionNotFoundException,
  createTransactionNotReversibleException,
} from './transactions.errors';
import type { CreateTransactionDto } from './dto/create-transaction.dto';
import type { UpdateTransactionDto } from './dto/update-transaction.dto';
import type { BulkUpdateTransactionsDto } from './dto/bulk-update-transactions.dto';
import type { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';
import type {
  InvestmentTransactionDetailResponse,
  TransactionResponse,
  TransactionsListResponse,
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
  priceCurrency: true,
  grossAmount: true,
  fees: true,
  fxRateUsdToPkr: true,
  fxRateSource: true,
  fxRateUpdatedAt: true,
  notes: true,
} satisfies Prisma.InvestmentTransactionDetailSelect;

const transactionSelect = {
  id: true,
  type: true,
  status: true,
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
  category: true,
  description: true,
  merchant: true,
  notes: true,
  reference: true,
  labels: true,
  deletedAt: true,
  investmentDetail: {
    select: investmentDetailSelect,
  },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TransactionSelect;

type TransactionRecord = Prisma.TransactionGetPayload<{
  select: typeof transactionSelect;
}>;

const investmentTypes = new Set<string>([
  'INVESTMENT_BUY',
  'INVESTMENT_SELL',
  'DIVIDEND',
  'INTEREST',
  'INVESTMENT_SPLIT',
  'INVESTMENT_BONUS',
  'INVESTMENT_REINVESTMENT',
  'INVESTMENT_DEPOSIT',
  'INVESTMENT_WITHDRAWAL',
]);

const investmentDetailRequiredTypes = new Set<string>([
  'INVESTMENT_BUY',
  'INVESTMENT_SELL',
  'INVESTMENT_SPLIT',
  'INVESTMENT_BONUS',
  'INVESTMENT_REINVESTMENT',
  'INVESTMENT_DEPOSIT',
  'INVESTMENT_WITHDRAWAL',
]);

const investmentDetailSupportedTypes = new Set<string>([
  ...investmentDetailRequiredTypes,
  'DIVIDEND',
]);

const reversibleTypes = new Set<string>([
  'INCOME',
  'EXPENSE',
  'REFUND',
  'FEE',
  'INVESTMENT_BUY',
  'INVESTMENT_SELL',
  'DIVIDEND',
  'INTEREST',
  'INVESTMENT_REINVESTMENT',
]);

const incomingTypes = new Set<TransactionType>([
  'INCOME',
  'REFUND',
  'INVESTMENT_SELL',
  'DIVIDEND',
  'INTEREST',
]);

const outgoingTypes = new Set<TransactionType>([
  'EXPENSE',
  'FEE',
  'INVESTMENT_BUY',
  'INVESTMENT_REINVESTMENT',
]);

const summaryIncomingTypes = new Set<TransactionType>([
  'INCOME',
  'REFUND',
  'DIVIDEND',
  'INTEREST',
]);

const summaryOutgoingTypes = new Set<TransactionType>(['EXPENSE', 'FEE']);

const categorisableTypes = new Set<TransactionType>([
  'INCOME',
  'EXPENSE',
  'REFUND',
  'FEE',
  'DIVIDEND',
  'INTEREST',
  'ADJUSTMENT',
]);

interface InvestmentPayload {
  readonly assetId: string;
  readonly tradeType: string;
  readonly quantity?: string;
  readonly price?: string;
  readonly fees?: string;
  readonly notes?: string;
}

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listTransactionsForUser(
    user: AuthenticatedUser,
    query: ListTransactionsQueryDto,
  ): Promise<TransactionsListResponse> {
    const where = this.buildListWhere(user.id, query);
    const orderBy = this.buildListOrderBy(query);
    const skip = (query.page - 1) * query.pageSize;

    const [transactions, total, summaryGroups, adjustments, optionRows] =
      await Promise.all([
        this.prisma.transaction.findMany({
          where,
          orderBy,
          skip,
          take: query.pageSize,
          select: transactionSelect,
        }),
        this.prisma.transaction.count({ where }),
        this.prisma.transaction.groupBy({
          by: ['type', 'currency'],
          where: {
            AND: [where, { status: 'CLEARED', deletedAt: null }],
          },
          _sum: { amount: true },
        }),
        this.prisma.transaction.findMany({
          where: {
            AND: [
              where,
              {
                type: 'ADJUSTMENT',
                status: 'CLEARED',
                deletedAt: null,
              },
            ],
          },
          select: { amount: true, currency: true },
        }),
        this.prisma.transaction.findMany({
          where: { userId: user.id, deletedAt: null },
          select: { category: true, currency: true, labels: true },
        }),
      ]);

    const summary = this.calculateListSummary(
      user,
      summaryGroups,
      adjustments,
      total,
    );
    const filterOptions = this.buildFilterOptions(optionRows);

    return {
      data: transactions.map((transaction) =>
        this.toTransactionResponse(transaction),
      ),
      meta: {
        total,
        page: query.page,
        pageSize: query.pageSize,
        pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
        baseCurrency: user.baseCurrency,
        summary,
        filterOptions,
      },
    };
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

  async bulkUpdateTransactionsForUser(
    user: AuthenticatedUser,
    payload: BulkUpdateTransactionsDto,
  ): Promise<readonly string[]> {
    return this.prisma.$transaction(async (tx) => {
      const transactions = await tx.transaction.findMany({
        where: {
          id: { in: payload.transactionIds },
          userId: user.id,
          deletedAt: null,
        },
        select: {
          id: true,
          type: true,
          labels: true,
          reversalOfId: true,
          reversal: { select: { id: true } },
        },
      });

      if (transactions.length !== payload.transactionIds.length) {
        throw createInvalidBulkTransactionException(
          'Every selected transaction must exist and belong to the current user.',
        );
      }

      if (
        payload.category &&
        transactions.some((transaction) =>
          categorisableTypes.has(transaction.type),
        ) === false
      ) {
        throw createInvalidBulkTransactionException(
          'The selected transaction types cannot be categorized.',
        );
      }

      if (
        payload.category &&
        transactions.some(
          (transaction) => !categorisableTypes.has(transaction.type),
        )
      ) {
        throw createInvalidBulkTransactionException(
          'Change category is unavailable when the selection contains a non-categorizable transaction.',
        );
      }

      const now = new Date();
      for (const transaction of transactions) {
        if (transaction.reversalOfId || transaction.reversal) {
          throw createInvalidBulkTransactionException(
            'Reversed transactions and reversal entries cannot be changed in bulk.',
          );
        }

        const labels = new Set(transaction.labels);
        payload.addLabels?.forEach((label) => labels.add(label.trim()));
        payload.removeLabels?.forEach((label) => labels.delete(label.trim()));

        await tx.transaction.update({
          where: { id: transaction.id },
          data: {
            category: payload.category,
            status: payload.delete ? 'VOIDED' : payload.status,
            labels:
              payload.addLabels || payload.removeLabels
                ? [...labels].filter(Boolean)
                : undefined,
            deletedAt: payload.delete ? now : undefined,
          },
        });
      }

      return transactions.map((transaction) => transaction.id);
    });
  }

  async createTransactionForUser(
    user: AuthenticatedUser,
    payload: CreateTransactionDto,
  ): Promise<TransactionResponse> {
    if (payload.idempotencyKey) {
      const existing = await this.prisma.transaction.findFirst({
        where: {
          userId: user.id,
          idempotencyKey: payload.idempotencyKey,
        },
        select: transactionSelect,
      });

      if (existing) {
        return this.toTransactionResponse(existing);
      }
    }

    await this.validateTransactionAccounts(user.id, {
      ...payload,
      currency: payload.currency,
    });

    if (investmentDetailRequiredTypes.has(payload.type) || payload.investment) {
      this.validateInvestmentPayload(payload.type, payload.investment);
    }

    const investmentAsset = payload.investment
      ? await this.validateInvestmentAsset(user.id, payload.investment.assetId)
      : null;

    if (payload.investment) {
      await this.assertSufficientHolding(
        user.id,
        payload.type,
        {
          assetId: payload.investment.assetId,
          quantity: payload.investment.quantity ?? '0',
        },
        undefined,
        payload.accountId,
      );
    }

    const authoritativeAmount = this.resolveAuthoritativeAmount(
      payload.type,
      payload.amount,
      payload.investment,
      investmentAsset?.priceCurrency ?? payload.currency,
      payload.currency,
      user.exchangeRate,
    );
    const investmentDetailData = payload.investment
      ? this.buildInvestmentDetailData(
          payload.type,
          payload.investment,
          investmentAsset?.priceCurrency ?? payload.currency,
          user,
        )
      : undefined;

    const transaction = await this.prisma.transaction.create({
      data: {
        userId: user.id,
        idempotencyKey: payload.idempotencyKey,
        type: payload.type,
        status: payload.status,
        accountId: payload.accountId,
        destinationAccountId: payload.destinationAccountId,
        amount: authoritativeAmount,
        currency: payload.currency,
        occurredAt: new Date(payload.occurredAt),
        category: payload.category,
        description: payload.description,
        merchant: payload.merchant,
        notes: payload.notes,
        reference: payload.reference,
        labels: payload.labels,
        investmentDetail: investmentDetailData
          ? {
              create: investmentDetailData,
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
      payload.investment !== undefined
        ? (payload.investment ?? undefined)
        : investmentDetailSupportedTypes.has(effectiveType) &&
            existingTransaction.investmentDetail
          ? this.recordToInvestmentPayload(existingTransaction.investmentDetail)
          : undefined;
    const effectiveAmount =
      payload.amount ?? existingTransaction.amount.toString();

    await this.validateTransactionAccounts(user.id, {
      type: effectiveType,
      accountId: effectiveAccountId,
      destinationAccountId: effectiveDestinationAccountId ?? undefined,
      currency: effectiveCurrency,
    });

    if (
      investmentDetailRequiredTypes.has(effectiveType) ||
      effectiveInvestment
    ) {
      this.validateInvestmentPayload(effectiveType, effectiveInvestment);
    }

    const investmentAsset = effectiveInvestment
      ? await this.validateInvestmentAsset(user.id, effectiveInvestment.assetId)
      : null;

    if (effectiveInvestment) {
      await this.assertSufficientHolding(
        user.id,
        effectiveType,
        {
          assetId: effectiveInvestment.assetId,
          quantity: effectiveInvestment.quantity ?? '0',
        },
        transactionId,
        effectiveAccountId,
      );
    }

    const authoritativeAmount = this.resolveAuthoritativeAmount(
      effectiveType,
      effectiveAmount,
      effectiveInvestment,
      investmentAsset?.priceCurrency ?? effectiveCurrency,
      effectiveCurrency,
      user.exchangeRate,
    );

    const transaction = await this.prisma.transaction.update({
      where: {
        id: transactionId,
      },
      data: {
        type: payload.type,
        status: payload.status,
        accountId: payload.accountId,
        destinationAccountId: payload.destinationAccountId,
        amount: authoritativeAmount,
        currency: payload.currency,
        occurredAt: payload.occurredAt
          ? new Date(payload.occurredAt)
          : undefined,
        category: payload.category,
        description: payload.description,
        merchant: payload.merchant,
        notes: payload.notes,
        reference: payload.reference,
        labels: payload.labels,
        investmentDetail: this.buildInvestmentDetailUpdatePayload(
          effectiveType,
          existingTransaction.investmentDetail,
          payload.investment,
          investmentAsset?.priceCurrency ?? effectiveCurrency,
          user,
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
          status: 'CLEARED',
          accountId: originalTransaction.accountId,
          destinationAccountId: originalTransaction.destinationAccountId,
          reversalOfId: originalTransaction.id,
          amount: reversalAmount,
          currency: originalTransaction.currency,
          occurredAt: new Date(),
          category: originalTransaction.category,
          description: `Reversal: ${getTransactionDisplayText(originalTransaction)}`,
          merchant: originalTransaction.merchant,
          notes: 'Reversal of transaction ' + originalTransaction.id,
          reference: originalTransaction.reference,
          labels: originalTransaction.labels,
          investmentDetail: originalTransaction.investmentDetail
            ? {
                create: {
                  assetId: originalTransaction.investmentDetail.assetId,
                  tradeType: originalTransaction.investmentDetail.tradeType,
                  quantity:
                    originalTransaction.investmentDetail.quantity.toString(),
                  price: originalTransaction.investmentDetail.price.toString(),
                  priceCurrency:
                    originalTransaction.investmentDetail.priceCurrency,
                  grossAmount:
                    originalTransaction.investmentDetail.grossAmount.toString(),
                  fees: originalTransaction.investmentDetail.fees.toString(),
                  fxRateUsdToPkr:
                    originalTransaction.investmentDetail.fxRateUsdToPkr,
                  fxRateSource:
                    originalTransaction.investmentDetail.fxRateSource,
                  fxRateUpdatedAt:
                    originalTransaction.investmentDetail.fxRateUpdatedAt,
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

    await this.prisma.transaction.update({
      where: {
        id: transactionId,
      },
      data: {
        status: 'VOIDED',
        deletedAt: new Date(),
      },
    });
  }

  private buildListWhere(
    userId: string,
    query: ListTransactionsQueryDto,
  ): Prisma.TransactionWhereInput {
    const conditions: Prisma.TransactionWhereInput[] = [];

    if (query.search) {
      conditions.push({
        OR: [
          { description: { contains: query.search, mode: 'insensitive' } },
          { category: { contains: query.search, mode: 'insensitive' } },
          { merchant: { contains: query.search, mode: 'insensitive' } },
          { notes: { contains: query.search, mode: 'insensitive' } },
          { reference: { contains: query.search, mode: 'insensitive' } },
          { labels: { has: query.search } },
          {
            account: {
              name: { contains: query.search, mode: 'insensitive' },
            },
          },
          {
            destinationAccount: {
              name: { contains: query.search, mode: 'insensitive' },
            },
          },
        ],
      });
    }

    if (query.dateFrom || query.dateTo) {
      conditions.push({
        occurredAt: {
          gte: query.dateFrom ? new Date(query.dateFrom) : undefined,
          lte: query.dateTo ? new Date(query.dateTo) : undefined,
        },
      });
    }

    if (query.accountIds?.length) {
      conditions.push({
        OR: [
          { accountId: { in: query.accountIds } },
          { destinationAccountId: { in: query.accountIds } },
        ],
      });
    }

    if (query.types?.length) {
      conditions.push({ type: { in: query.types } });
    }

    if (query.categories?.length) {
      conditions.push({ category: { in: query.categories } });
    }

    if (query.labels?.length) {
      conditions.push({ labels: { hasSome: query.labels } });
    }

    if (query.statuses?.length) {
      conditions.push({ status: { in: query.statuses } });
    }

    if (query.currencies?.length) {
      conditions.push({ currency: { in: query.currencies } });
    }

    if (query.direction === 'IN') {
      conditions.push({
        OR: [
          { type: { in: [...incomingTypes] } },
          { type: 'ADJUSTMENT', amount: { gt: 0 } },
        ],
      });
    } else if (query.direction === 'OUT') {
      conditions.push({
        OR: [
          { type: { in: [...outgoingTypes] } },
          { type: 'ADJUSTMENT', amount: { lt: 0 } },
        ],
      });
    }

    if (query.minAmount) {
      conditions.push({
        OR: [
          { amount: { gte: query.minAmount } },
          { amount: { lte: new Prisma.Decimal(query.minAmount).negated() } },
        ],
      });
    }

    if (query.maxAmount) {
      conditions.push({
        amount: {
          gte: new Prisma.Decimal(query.maxAmount).negated(),
          lte: query.maxAmount,
        },
      });
    }

    if (query.hasNote === true) {
      conditions.push({ notes: { not: null } });
      conditions.push({ NOT: { notes: '' } });
    } else if (query.hasNote === false) {
      conditions.push({ OR: [{ notes: null }, { notes: '' }] });
    }

    if (query.uncategorizedOnly) {
      conditions.push({ category: '' });
    }

    return {
      userId,
      deletedAt: null,
      AND: conditions,
    };
  }

  private buildListOrderBy(
    query: ListTransactionsQueryDto,
  ): Prisma.TransactionOrderByWithRelationInput[] {
    const direction = query.sortDirection;
    const primary: Prisma.TransactionOrderByWithRelationInput =
      query.sortBy === 'amount'
        ? { amount: direction }
        : query.sortBy === 'description'
          ? { description: direction }
          : query.sortBy === 'account'
            ? { account: { name: direction } }
            : query.sortBy === 'category'
              ? { category: direction }
              : query.sortBy === 'createdAt'
                ? { createdAt: direction }
                : { occurredAt: direction };

    return [primary, { createdAt: 'desc' }];
  }

  private calculateListSummary(
    user: AuthenticatedUser,
    groups: ReadonlyArray<{
      readonly type: TransactionType;
      readonly currency: string;
      readonly _sum: { readonly amount: Prisma.Decimal | null };
    }>,
    adjustments: ReadonlyArray<{
      readonly amount: Prisma.Decimal;
      readonly currency: string;
    }>,
    transactionCount: number,
  ): TransactionsListResponse['meta']['summary'] {
    const converter = new CurrencyConverter(
      user.baseCurrency,
      user.exchangeRate,
    );
    let moneyIn = new Prisma.Decimal(0);
    let moneyOut = new Prisma.Decimal(0);

    for (const group of groups) {
      if (group.type === 'ADJUSTMENT' || !group._sum.amount) {
        continue;
      }

      const amount = converter.convert(group._sum.amount, group.currency);
      if (summaryIncomingTypes.has(group.type)) {
        if (amount.isNegative()) {
          moneyOut = moneyOut.add(amount.abs());
        } else {
          moneyIn = moneyIn.add(amount);
        }
      } else if (summaryOutgoingTypes.has(group.type)) {
        if (amount.isNegative()) {
          moneyIn = moneyIn.add(amount.abs());
        } else {
          moneyOut = moneyOut.add(amount);
        }
      }
    }

    for (const adjustment of adjustments) {
      const amount = converter.convert(adjustment.amount, adjustment.currency);
      if (amount.isNegative()) {
        moneyOut = moneyOut.add(amount.abs());
      } else {
        moneyIn = moneyIn.add(amount);
      }
    }

    return {
      moneyIn: moneyIn.toFixed(2),
      moneyOut: moneyOut.toFixed(2),
      netCashFlow: moneyIn.sub(moneyOut).toFixed(2),
      transactionCount,
    };
  }

  private buildFilterOptions(
    rows: ReadonlyArray<{
      readonly category: string;
      readonly currency: string;
      readonly labels: readonly string[];
    }>,
  ): TransactionsListResponse['meta']['filterOptions'] {
    return {
      categories: [
        ...new Set(rows.map((row) => row.category).filter(Boolean)),
      ].sort((left, right) => left.localeCompare(right)),
      labels: [...new Set(rows.flatMap((row) => row.labels))].sort(
        (left, right) => left.localeCompare(right),
      ),
      currencies: [...new Set(rows.map((row) => row.currency))].sort(),
    };
  }

  private assertTransactionIsMutable(transaction: TransactionRecord): void {
    if (
      transaction.reversalOfId ||
      transaction.reversal ||
      transaction.deletedAt ||
      transaction.status === 'VOIDED'
    ) {
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
        type: true,
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

    if (
      investmentTypes.has(payload.type) &&
      account.type !== undefined &&
      account.type !== 'BROKER' &&
      account.type !== 'CRYPTO_WALLET'
    ) {
      throw createInvalidInvestmentAccountException();
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
    type: TransactionType,
    investment:
      | {
          readonly assetId: string;
          readonly tradeType: string;
          readonly quantity?: string;
          readonly price?: string;
          readonly fees?: string;
        }
      | null
      | undefined,
  ): void {
    if (!investment) {
      throw createInvestmentDetailRequiredException(type);
    }

    if (!investmentDetailSupportedTypes.has(type)) {
      throw createInvalidInvestmentAmountException(
        'Investment details are not supported for this transaction type.',
      );
    }

    const expectedTradeType = this.getExpectedTradeType(type);
    if (investment.tradeType !== expectedTradeType) {
      throw createInvalidInvestmentTradeTypeException(
        expectedTradeType,
        investment.tradeType,
      );
    }

    const quantity = new Prisma.Decimal(investment.quantity ?? '0');
    const price = new Prisma.Decimal(investment.price ?? '0');

    if (
      type === 'INVESTMENT_BUY' ||
      type === 'INVESTMENT_SELL' ||
      type === 'INVESTMENT_REINVESTMENT'
    ) {
      if (quantity.isZero() || quantity.isNegative()) {
        throw createInvalidInvestmentAmountException(
          'Quantity must be greater than zero.',
        );
      }

      if (price.isZero() || price.isNegative()) {
        throw createInvalidInvestmentAmountException(
          'Price must be greater than zero.',
        );
      }
    }

    if (
      type === 'INVESTMENT_BONUS' ||
      type === 'INVESTMENT_SPLIT' ||
      type === 'INVESTMENT_DEPOSIT' ||
      type === 'INVESTMENT_WITHDRAWAL'
    ) {
      if (quantity.isZero() || quantity.isNegative()) {
        throw createInvalidInvestmentAmountException(
          'Quantity must be greater than zero.',
        );
      }

      if (!price.isZero()) {
        throw createInvalidInvestmentAmountException(
          'Price must be zero for non-cash investment transactions.',
        );
      }
    }

    if (type === 'DIVIDEND') {
      if (!quantity.isZero()) {
        throw createInvalidInvestmentAmountException(
          'Quantity must be zero for dividend transactions.',
        );
      }

      if (!price.isZero()) {
        throw createInvalidInvestmentAmountException(
          'Price must be zero for dividend transactions.',
        );
      }
    }

    if (investment.fees !== undefined) {
      const fees = new Prisma.Decimal(investment.fees);
      if (fees.isNegative()) {
        throw createInvalidInvestmentAmountException(
          'Fees cannot be negative.',
        );
      }

      if (
        type !== 'INVESTMENT_BUY' &&
        type !== 'INVESTMENT_SELL' &&
        type !== 'INVESTMENT_REINVESTMENT' &&
        !fees.isZero()
      ) {
        throw createInvalidInvestmentAmountException(
          'Fees must be zero for this transaction type.',
        );
      }
    }
  }

  private resolveAuthoritativeAmount(
    type: TransactionType,
    manualAmount: string | undefined,
    investment: InvestmentPayload | undefined,
    priceCurrency: string,
    transactionCurrency: string,
    exchangeRate: string | null,
  ): Prisma.Decimal {
    if (
      type === 'INVESTMENT_BUY' ||
      type === 'INVESTMENT_SELL' ||
      type === 'INVESTMENT_REINVESTMENT'
    ) {
      if (!investment) {
        throw createInvestmentDetailRequiredException(type);
      }

      const calculation = calculateInvestmentTransactionAmounts({
        type,
        quantity: new Prisma.Decimal(investment.quantity ?? '0'),
        price: new Prisma.Decimal(investment.price ?? '0'),
        fees: new Prisma.Decimal(investment.fees ?? '0'),
      });

      const convertedGrossAmount = convertUsdPkr(
        calculation.grossAmount,
        priceCurrency,
        transactionCurrency,
        exchangeRate ? new Prisma.Decimal(exchangeRate) : null,
      );

      if (!convertedGrossAmount) {
        throw createInvalidInvestmentAmountException(
          `A USD-to-PKR exchange rate is required to convert ${priceCurrency} asset prices into ${transactionCurrency}.`,
        );
      }

      const fees = new Prisma.Decimal(investment.fees ?? '0');
      const cashImpact =
        type === 'INVESTMENT_SELL'
          ? convertedGrossAmount.sub(fees)
          : convertedGrossAmount.add(fees);

      if (cashImpact.isNegative()) {
        throw createInvalidInvestmentAmountException(
          'Fees cannot exceed gross sale proceeds.',
        );
      }

      return cashImpact;
    }

    if (
      type === 'INVESTMENT_SPLIT' ||
      type === 'INVESTMENT_BONUS' ||
      type === 'INVESTMENT_DEPOSIT' ||
      type === 'INVESTMENT_WITHDRAWAL'
    ) {
      return new Prisma.Decimal(0);
    }

    if (manualAmount === undefined) {
      throw createInvalidTransactionAmountException(
        'An amount is required for this transaction type.',
      );
    }

    return new Prisma.Decimal(normalizeAmount(manualAmount, type));
  }

  private buildInvestmentDetailData(
    type: TransactionType,
    investment: InvestmentPayload,
    priceCurrency: string,
    user: AuthenticatedUser,
  ): {
    readonly assetId: string;
    readonly tradeType: TradeType;
    readonly quantity: string;
    readonly price: string;
    readonly priceCurrency: string;
    readonly grossAmount: Prisma.Decimal;
    readonly fees: string;
    readonly fxRateUsdToPkr: string | undefined;
    readonly fxRateSource: string | undefined;
    readonly fxRateUpdatedAt: Date | undefined;
    readonly notes: string | undefined;
  } {
    const quantity = investment.quantity ?? '0';
    const price = investment.price ?? '0';
    const fees = investment.fees ?? '0';
    const calculation = calculateInvestmentTransactionAmounts({
      type,
      quantity: new Prisma.Decimal(quantity),
      price: new Prisma.Decimal(price),
      fees: new Prisma.Decimal(fees),
    });

    return {
      assetId: investment.assetId,
      tradeType: this.getExpectedTradeType(type),
      quantity,
      price,
      priceCurrency,
      grossAmount: calculation.grossAmount,
      fees,
      fxRateUsdToPkr: user.exchangeRate ?? undefined,
      fxRateSource: user.exchangeRate ? user.exchangeRateSource : undefined,
      fxRateUpdatedAt:
        user.exchangeRate && user.exchangeRateUpdatedAt
          ? new Date(user.exchangeRateUpdatedAt)
          : undefined,
      notes: investment.notes,
    };
  }

  private getExpectedTradeType(type: TransactionType): TradeType {
    switch (type) {
      case 'INVESTMENT_BUY':
        return 'BUY';
      case 'INVESTMENT_SELL':
        return 'SELL';
      case 'DIVIDEND':
        return 'DIVIDEND';
      case 'INTEREST':
        return 'INTEREST';
      case 'INVESTMENT_SPLIT':
        return 'SPLIT';
      case 'INVESTMENT_BONUS':
        return 'BONUS';
      case 'INVESTMENT_REINVESTMENT':
        return 'REINVESTMENT';
      case 'INVESTMENT_DEPOSIT':
        return 'DEPOSIT';
      case 'INVESTMENT_WITHDRAWAL':
        return 'WITHDRAWAL';
      default:
        throw createInvalidInvestmentAmountException(
          'This transaction type does not support investment details.',
        );
    }
  }

  private async validateInvestmentAsset(
    userId: string,
    assetId: string,
  ): Promise<{ readonly id: string; readonly priceCurrency: string | null }> {
    const asset = await this.prisma.asset.findFirst({
      where: {
        id: assetId,
        userId,
      },
      select: {
        id: true,
        priceCurrency: true,
      },
    });

    if (!asset) {
      throw createAssetNotFoundForTransactionException(assetId);
    }

    return asset;
  }

  private async assertSufficientHolding(
    userId: string,
    type: string,
    investment: {
      readonly assetId: string;
      readonly quantity: string;
    },
    excludedTransactionId?: string,
    accountId?: string,
  ): Promise<void> {
    if (type !== 'INVESTMENT_SELL' && type !== 'INVESTMENT_WITHDRAWAL') {
      return;
    }

    const details = await this.prisma.investmentTransactionDetail.findMany({
      where: {
        assetId: investment.assetId,
        asset: { userId },
        transactionId: excludedTransactionId
          ? { not: excludedTransactionId }
          : undefined,
        transaction: {
          status: 'CLEARED',
          deletedAt: null,
          accountId,
        },
      },
      select: {
        tradeType: true,
        quantity: true,
        price: true,
        fees: true,
      },
    });
    const holding = calculateHolding({
      currentPrice: null,
      priceCurrency: null,
      transactions: details.map((detail) => ({
        type: detail.tradeType as InvestmentTransactionInput['type'],
        quantity: detail.quantity,
        price: detail.price,
        fees: detail.fees,
      })),
    });

    if (holding.quantity.lessThan(investment.quantity)) {
      throw createInsufficientHoldingException(investment.assetId);
    }
  }

  private buildInvestmentDetailUpdatePayload(
    effectiveType: TransactionType,
    existingDetail: TransactionRecord['investmentDetail'],
    payloadInvestment:
      | {
          readonly assetId: string;
          readonly tradeType: string;
          readonly quantity?: string;
          readonly price?: string;
          readonly fees?: string;
          readonly notes?: string;
        }
      | null
      | undefined,
    priceCurrency: string,
    user: AuthenticatedUser,
  ):
    | {
        create?: Prisma.InvestmentTransactionDetailCreateWithoutTransactionInput;
        update?: Prisma.InvestmentTransactionDetailUpdateWithoutTransactionInput;
        delete?: true;
      }
    | undefined {
    if (!investmentDetailSupportedTypes.has(effectiveType)) {
      if (existingDetail) {
        return { delete: true };
      }

      return undefined;
    }

    if (payloadInvestment === null) {
      return existingDetail ? { delete: true } : undefined;
    }

    if (!payloadInvestment) {
      return undefined;
    }

    const calculatedDetail = this.buildInvestmentDetailData(
      effectiveType,
      payloadInvestment,
      priceCurrency,
      user,
    );
    const detailData = {
      asset: {
        connect: {
          id: payloadInvestment.assetId,
        },
      },
      tradeType: this.getExpectedTradeType(effectiveType),
      quantity: calculatedDetail.quantity,
      price: calculatedDetail.price,
      priceCurrency: calculatedDetail.priceCurrency,
      grossAmount: calculatedDetail.grossAmount,
      fees: calculatedDetail.fees,
      fxRateUsdToPkr: calculatedDetail.fxRateUsdToPkr,
      fxRateSource: calculatedDetail.fxRateSource,
      fxRateUpdatedAt: calculatedDetail.fxRateUpdatedAt,
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
        readonly quantity?: string;
        readonly price?: string;
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
      status: transaction.status,
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
      category: transaction.category,
      description: transaction.description,
      merchant: transaction.merchant,
      notes: transaction.notes,
      reference: transaction.reference,
      labels: transaction.labels,
      deletedAt: transaction.deletedAt?.toISOString() ?? null,
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
      priceCurrency: detail.priceCurrency,
      grossAmount: detail.grossAmount.toString(),
      fees: detail.fees.toString(),
      fxRateUsdToPkr: detail.fxRateUsdToPkr?.toString() ?? null,
      fxRateSource: detail.fxRateSource,
      fxRateUpdatedAt: detail.fxRateUpdatedAt?.toISOString() ?? null,
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

function getTransactionDisplayText(transaction: {
  readonly category: string;
  readonly description: string;
}): string {
  return transaction.description || transaction.category;
}
