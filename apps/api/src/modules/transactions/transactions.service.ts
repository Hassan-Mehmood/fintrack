import { Injectable, Optional } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { TradeType, TransactionType } from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { calculateHolding } from '../../common/financial/holdings';
import { calculateInvestmentTransactionAmounts } from '../../common/financial/investment-transaction-calculations';
import { holdingTransactionsForAsset } from '../../common/financial/settlement-holdings';
import { convertUsdPkr } from '../../common/financial/fx-conversion';
import { CurrencyConverter } from '../../common/financial/currency-converter';
import {
  calculateAccountBalance,
  getSourceAccountEffect,
  hasDestinationBalanceEffect,
} from '../../common/financial/transaction-effects';
import { PrismaService } from '../../prisma/prisma.service';
import { CategoriesService } from '../categories/categories.service';
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
  createInvalidTransactionCategoryException,
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
  AccountTransactionsListResponse,
  AccountTransactionResponse,
  TransactionResponse,
  TransactionsListResponse,
} from './transactions.types';
import { AssetsService } from '../assets/assets.service';
import type { SettlementAssetDto } from '../investments/dto/settlement-asset.dto';
import {
  insufficientSettlementBalanceException,
  insufficientAccountCashException,
  invalidSettlementAssetException,
  settlementAssetNotFoundException,
  settlementAssetRequiredException,
} from '../investments/investment-settlement.errors';

const investmentDetailSelect = {
  id: true,
  assetId: true,
  asset: {
    select: {
      name: true,
      symbol: true,
    },
  },
  settlementAssetId: true,
  settlementAsset: {
    select: { name: true, symbol: true },
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
  'INVESTMENT_TRANSFER',
  'INVESTMENT_OPENING_POSITION',
]);

const investmentDetailRequiredTypes = new Set<string>([
  'INVESTMENT_BUY',
  'INVESTMENT_SELL',
  'INVESTMENT_SPLIT',
  'INVESTMENT_BONUS',
  'INVESTMENT_REINVESTMENT',
  'INVESTMENT_DEPOSIT',
  'INVESTMENT_WITHDRAWAL',
  'INVESTMENT_TRANSFER',
  'INVESTMENT_OPENING_POSITION',
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
  'INVESTMENT_TRANSFER',
  'INVESTMENT_OPENING_POSITION',
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
  'TRANSFER',
  'REFUND',
  'FEE',
  'INVESTMENT_BUY',
  'INVESTMENT_SELL',
  'DIVIDEND',
  'INTEREST',
  'INVESTMENT_SPLIT',
  'INVESTMENT_BONUS',
  'INVESTMENT_REINVESTMENT',
  'INVESTMENT_DEPOSIT',
  'INVESTMENT_WITHDRAWAL',
  'INVESTMENT_TRANSFER',
  'INVESTMENT_OPENING_POSITION',
  'ADJUSTMENT',
]);

interface InvestmentPayload {
  readonly assetId: string;
  readonly tradeType: string;
  readonly quantity?: string;
  readonly price?: string;
  readonly fees?: string;
  readonly notes?: string;
  readonly settlementAsset?: SettlementAssetDto;
}

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categoriesService: CategoriesService,
    @Optional() private readonly assetsService?: AssetsService,
  ) {}

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

  async listAccountTransactionsForUser(
    user: AuthenticatedUser,
    accountId: string,
    query: ListTransactionsQueryDto,
  ): Promise<AccountTransactionsListResponse> {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, userId: user.id },
      select: { id: true, currency: true },
    });
    if (!account) {
      throw createAccountNotFoundForTransactionException(accountId);
    }

    const where = this.buildListWhere(user.id, query, accountId);
    const orderBy = this.buildListOrderBy(query);
    const skip = (query.page - 1) * query.pageSize;
    const [transactions, total, summaryRows, optionRows] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy,
        skip,
        take: query.pageSize,
        select: transactionSelect,
      }),
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.findMany({
        where: { AND: [where, { status: 'CLEARED', deletedAt: null }] },
        select: {
          type: true,
          accountId: true,
          destinationAccountId: true,
          amount: true,
        },
      }),
      this.prisma.transaction.findMany({
        where: { userId: user.id, deletedAt: null },
        select: { category: true, currency: true, labels: true },
      }),
    ]);

    let moneyIn = new Prisma.Decimal(0);
    let moneyOut = new Prisma.Decimal(0);
    for (const row of summaryRows) {
      const effect = this.getAccountEffect(row, accountId);
      if (effect.gt(0)) moneyIn = moneyIn.add(effect);
      if (effect.lt(0)) moneyOut = moneyOut.add(effect.abs());
    }

    return {
      data: transactions.map((transaction) =>
        this.toAccountTransactionResponse(transaction, accountId),
      ),
      meta: {
        total,
        page: query.page,
        pageSize: query.pageSize,
        pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
        baseCurrency: account.currency,
        summary: {
          moneyIn: moneyIn.toFixed(2),
          moneyOut: moneyOut.toFixed(2),
          netCashFlow: moneyIn.sub(moneyOut).toFixed(2),
          transactionCount: total,
        },
        filterOptions: this.buildFilterOptions(optionRows),
      },
    };
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

      if (payload.category) {
        const category = payload.category;
        const categoryChecks = await Promise.all(
          [...new Set(transactions.map((transaction) => transaction.type))].map(
            (type) =>
              this.categoriesService.isAllowedForUser(user.id, type, category),
          ),
        );
        if (categoryChecks.some((allowed) => !allowed)) {
          throw createInvalidBulkTransactionException(
            'Select a category available for every selected transaction type.',
          );
        }
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

    await this.assertCategoryAllowed(user.id, payload.type, payload.category);

    const transactionAccount = await this.validateTransactionAccounts(user.id, {
      ...payload,
      currency: payload.currency,
    });

    if (investmentDetailRequiredTypes.has(payload.type) || payload.investment) {
      this.validateInvestmentPayload(payload.type, payload.investment);
    }

    const investmentAsset = payload.investment
      ? await this.validateInvestmentAsset(user.id, payload.investment.assetId)
      : null;
    this.assertInvestmentDomainAccountCompatibility(
      investmentAsset?.domain,
      transactionAccount.type,
    );
    if (
      investmentAsset?.liquidityClass === 'CASH_EQUIVALENT' &&
      transactionAccount.type !== 'CRYPTO_WALLET'
    ) {
      throw createInvalidInvestmentAccountException();
    }
    if (
      payload.type === 'INVESTMENT_DEPOSIT' &&
      investmentAsset?.liquidityClass === 'CASH_EQUIVALENT' &&
      !new Prisma.Decimal(payload.investment?.price ?? '0').isPositive()
    ) {
      throw createInvalidInvestmentAmountException(
        'Stablecoin deposits require a positive cost per unit.',
      );
    }
    const createInvestment =
      payload.type === 'INVESTMENT_TRANSFER' && payload.investment
        ? {
            ...payload.investment,
            price: await this.resolveInvestmentTransferBasis(
              user.id,
              payload.accountId,
              payload.destinationAccountId,
              payload.investment.assetId,
              payload.investment.quantity ?? '0',
              investmentAsset,
            ),
            fees: '0',
          }
        : payload.investment;
    const isPairedCryptoTrade =
      transactionAccount.type === 'CRYPTO_WALLET' &&
      (payload.type === 'INVESTMENT_BUY' || payload.type === 'INVESTMENT_SELL');
    const settlementAssetId = isPairedCryptoTrade
      ? await this.resolveSettlementAsset(
          user,
          payload.investment?.settlementAsset,
          payload.investment!.assetId,
        )
      : null;

    if (createInvestment) {
      await this.assertSufficientHolding(
        user.id,
        payload.type,
        {
          assetId: createInvestment.assetId,
          quantity: createInvestment.quantity ?? '0',
        },
        undefined,
        payload.accountId,
      );
      if (
        settlementAssetId &&
        payload.type === 'INVESTMENT_BUY' &&
        (payload.status ?? 'CLEARED') === 'CLEARED'
      ) {
        const required = new Prisma.Decimal(createInvestment.quantity ?? '0')
          .times(createInvestment.price ?? '0')
          .add(createInvestment.fees ?? '0');
        await this.assertSufficientSettlement(
          user.id,
          payload.accountId,
          settlementAssetId,
          required,
        );
      }
      if (
        transactionAccount.type === 'BROKER' &&
        payload.type === 'INVESTMENT_BUY' &&
        (payload.status ?? 'CLEARED') === 'CLEARED'
      ) {
        const required = this.resolveAuthoritativeAmount(
          payload.type,
          payload.amount,
          payload.investment,
          investmentAsset?.priceCurrency ?? payload.currency,
          payload.currency,
          user.exchangeRate,
        );
        await this.assertSufficientAccountCash(
          user.id,
          payload.accountId,
          required,
        );
      }
    }

    const authoritativeAmount = this.resolveAuthoritativeAmount(
      payload.type,
      payload.amount,
      createInvestment,
      investmentAsset?.priceCurrency ?? payload.currency,
      payload.currency,
      user.exchangeRate,
      Boolean(settlementAssetId),
    );
    const investmentDetailData = createInvestment
      ? this.buildInvestmentDetailData(
          payload.type,
          createInvestment,
          investmentAsset?.priceCurrency ?? payload.currency,
          user,
          settlementAssetId,
        )
      : undefined;

    const createArgs = {
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
        description: payload.description ?? '',
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
    } satisfies Prisma.TransactionCreateArgs;

    const shouldGuardBalance =
      (payload.status ?? 'CLEARED') === 'CLEARED' &&
      (payload.type === 'INVESTMENT_TRANSFER' ||
        (payload.type === 'INVESTMENT_BUY' &&
          Boolean(settlementAssetId || transactionAccount.type === 'BROKER')));
    const transaction = shouldGuardBalance
      ? await this.prisma.$transaction(
          async (tx) => {
            if (payload.type === 'INVESTMENT_TRANSFER' && createInvestment) {
              await this.resolveInvestmentTransferBasis(
                user.id,
                payload.accountId,
                payload.destinationAccountId,
                createInvestment.assetId,
                createInvestment.quantity ?? '0',
                investmentAsset,
                undefined,
                tx,
              );
            } else if (settlementAssetId && payload.investment) {
              const required = new Prisma.Decimal(
                payload.investment.quantity ?? '0',
              )
                .times(payload.investment.price ?? '0')
                .add(payload.investment.fees ?? '0');
              await this.assertSufficientSettlement(
                user.id,
                payload.accountId,
                settlementAssetId,
                required,
                undefined,
                tx,
              );
            } else {
              await this.assertSufficientAccountCash(
                user.id,
                payload.accountId,
                authoritativeAmount,
                undefined,
                tx,
              );
            }
            return tx.transaction.create(createArgs);
          },
          { isolationLevel: 'Serializable' },
        )
      : await this.prisma.transaction.create(createArgs);

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
    let effectiveInvestment =
      payload.investment !== undefined
        ? (payload.investment ?? undefined)
        : investmentDetailSupportedTypes.has(effectiveType) &&
            existingTransaction.investmentDetail
          ? this.recordToInvestmentPayload(existingTransaction.investmentDetail)
          : undefined;
    const effectiveAmount =
      payload.amount ?? existingTransaction.amount.toString();
    const effectiveCategory = payload.category ?? existingTransaction.category;

    await this.assertCategoryAllowed(user.id, effectiveType, effectiveCategory);

    const transactionAccount = await this.validateTransactionAccounts(user.id, {
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
    this.assertInvestmentDomainAccountCompatibility(
      investmentAsset?.domain,
      transactionAccount.type,
    );
    if (
      investmentAsset?.liquidityClass === 'CASH_EQUIVALENT' &&
      transactionAccount.type !== 'CRYPTO_WALLET'
    ) {
      throw createInvalidInvestmentAccountException();
    }
    if (
      effectiveType === 'INVESTMENT_DEPOSIT' &&
      investmentAsset?.liquidityClass === 'CASH_EQUIVALENT' &&
      !new Prisma.Decimal(effectiveInvestment?.price ?? '0').isPositive()
    ) {
      throw createInvalidInvestmentAmountException(
        'Stablecoin deposits require a positive cost per unit.',
      );
    }
    if (effectiveType === 'INVESTMENT_TRANSFER' && effectiveInvestment) {
      effectiveInvestment = {
        ...effectiveInvestment,
        price: await this.resolveInvestmentTransferBasis(
          user.id,
          effectiveAccountId,
          effectiveDestinationAccountId ?? undefined,
          effectiveInvestment.assetId,
          effectiveInvestment.quantity ?? '0',
          investmentAsset,
          transactionId,
        ),
        fees: '0',
      };
    }
    const isTrade =
      effectiveType === 'INVESTMENT_BUY' || effectiveType === 'INVESTMENT_SELL';
    let effectiveSettlementAssetId = isTrade
      ? (existingTransaction.investmentDetail?.settlementAssetId ?? null)
      : null;
    if (
      payload.investment?.settlementAsset &&
      !existingTransaction.investmentDetail?.settlementAssetId
    ) {
      throw invalidSettlementAssetException(
        'Legacy crypto trades cannot be retrofitted with a settlement asset.',
      );
    }
    if (
      payload.investment?.settlementAsset &&
      existingTransaction.investmentDetail?.settlementAssetId &&
      investmentAsset
    ) {
      effectiveSettlementAssetId = await this.resolveSettlementAsset(
        user,
        payload.investment.settlementAsset,
        investmentAsset.id,
      );
    }

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
      if (
        effectiveSettlementAssetId &&
        effectiveType === 'INVESTMENT_BUY' &&
        (payload.status ?? existingTransaction.status) === 'CLEARED'
      ) {
        const required = new Prisma.Decimal(effectiveInvestment.quantity ?? '0')
          .times(effectiveInvestment.price ?? '0')
          .add(effectiveInvestment.fees ?? '0');
        await this.assertSufficientSettlement(
          user.id,
          effectiveAccountId,
          effectiveSettlementAssetId,
          required,
          transactionId,
        );
      }
      if (
        transactionAccount.type === 'BROKER' &&
        effectiveType === 'INVESTMENT_BUY' &&
        (payload.status ?? existingTransaction.status) === 'CLEARED'
      ) {
        const required = this.resolveAuthoritativeAmount(
          effectiveType,
          effectiveAmount,
          effectiveInvestment,
          investmentAsset?.priceCurrency ?? effectiveCurrency,
          effectiveCurrency,
          user.exchangeRate,
        );
        await this.assertSufficientAccountCash(
          user.id,
          effectiveAccountId,
          required,
          transactionId,
        );
      }
    }

    const authoritativeAmount = this.resolveAuthoritativeAmount(
      effectiveType,
      effectiveAmount,
      effectiveInvestment,
      investmentAsset?.priceCurrency ?? effectiveCurrency,
      effectiveCurrency,
      user.exchangeRate,
      Boolean(effectiveSettlementAssetId),
    );

    const updateArgs = {
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
          effectiveType === 'INVESTMENT_TRANSFER'
            ? effectiveInvestment
            : payload.investment,
          investmentAsset?.priceCurrency ?? effectiveCurrency,
          user,
          effectiveSettlementAssetId,
        ),
      },
      select: transactionSelect,
    } satisfies Prisma.TransactionUpdateArgs;

    const effectiveStatus = payload.status ?? existingTransaction.status;
    const shouldGuardBalance =
      effectiveStatus === 'CLEARED' &&
      (effectiveType === 'INVESTMENT_TRANSFER' ||
        (effectiveType === 'INVESTMENT_BUY' &&
          Boolean(
            effectiveSettlementAssetId || transactionAccount.type === 'BROKER',
          )));
    const transaction = shouldGuardBalance
      ? await this.prisma.$transaction(
          async (tx) => {
            if (
              effectiveType === 'INVESTMENT_TRANSFER' &&
              effectiveInvestment
            ) {
              await this.resolveInvestmentTransferBasis(
                user.id,
                effectiveAccountId,
                effectiveDestinationAccountId ?? undefined,
                effectiveInvestment.assetId,
                effectiveInvestment.quantity ?? '0',
                investmentAsset,
                transactionId,
                tx,
              );
            } else if (effectiveSettlementAssetId && effectiveInvestment) {
              const required = new Prisma.Decimal(
                effectiveInvestment.quantity ?? '0',
              )
                .times(effectiveInvestment.price ?? '0')
                .add(effectiveInvestment.fees ?? '0');
              await this.assertSufficientSettlement(
                user.id,
                effectiveAccountId,
                effectiveSettlementAssetId,
                required,
                transactionId,
                tx,
              );
            } else {
              await this.assertSufficientAccountCash(
                user.id,
                effectiveAccountId,
                authoritativeAmount,
                transactionId,
                tx,
              );
            }
            return tx.transaction.update(updateArgs);
          },
          { isolationLevel: 'Serializable' },
        )
      : await this.prisma.transaction.update(updateArgs);

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
                  settlementAssetId:
                    originalTransaction.investmentDetail.settlementAssetId,
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
    relativeAccountId?: string,
  ): Prisma.TransactionWhereInput {
    const conditions: Prisma.TransactionWhereInput[] = [];

    if (!relativeAccountId && query.scope === 'MONEY') {
      conditions.push({
        type: { notIn: [...investmentTypes] as TransactionType[] },
      });
      conditions.push({
        account: { type: { in: ['BANK', 'CASH_WALLET', 'DIGITAL_WALLET'] } },
      });
      conditions.push({
        OR: [
          { destinationAccountId: null },
          {
            destinationAccount: {
              type: { in: ['BANK', 'CASH_WALLET', 'DIGITAL_WALLET'] },
            },
          },
        ],
      });
    } else if (!relativeAccountId && query.scope) {
      const domain = query.scope === 'CRYPTO' ? 'CRYPTO' : 'SECURITIES';
      const accountType = domain === 'CRYPTO' ? 'CRYPTO_WALLET' : 'BROKER';
      conditions.push({
        OR: [
          { investmentDetail: { asset: { domain } } },
          {
            type: 'TRANSFER',
            OR: [
              { account: { type: accountType } },
              { destinationAccount: { type: accountType } },
            ],
          },
        ],
      });
    }

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

    if (relativeAccountId) {
      conditions.push({
        OR: [
          { accountId: relativeAccountId },
          { destinationAccountId: relativeAccountId },
        ],
      });
    } else if (query.accountIds?.length) {
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

    if (!relativeAccountId && query.currencies?.length) {
      conditions.push({ currency: { in: query.currencies } });
    }

    if (relativeAccountId && query.direction) {
      conditions.push(
        this.buildAccountDirectionWhere(relativeAccountId, query.direction),
      );
    } else if (query.direction === 'IN') {
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

  private buildAccountDirectionWhere(
    accountId: string,
    direction: 'IN' | 'OUT',
  ): Prisma.TransactionWhereInput {
    const positiveSourceTypes = [
      ...incomingTypes,
      'ADJUSTMENT',
    ] as TransactionType[];
    const negativeSourceTypes = [
      ...outgoingTypes,
      'TRANSFER',
    ] as TransactionType[];
    const incoming = direction === 'IN';

    return {
      OR: [
        {
          accountId,
          type: { in: positiveSourceTypes },
          amount: incoming ? { gt: 0 } : { lt: 0 },
        },
        {
          accountId,
          type: { in: negativeSourceTypes },
          amount: incoming ? { lt: 0 } : { gt: 0 },
        },
        {
          destinationAccountId: accountId,
          type: { in: ['TRANSFER', 'INVESTMENT_BUY'] },
          amount: incoming ? { gt: 0 } : { lt: 0 },
        },
      ],
    };
  }

  private async assertCategoryAllowed(
    userId: string,
    type: TransactionType,
    category: string,
  ): Promise<void> {
    if (
      !(await this.categoriesService.isAllowedForUser(userId, type, category))
    ) {
      throw createInvalidTransactionCategoryException(type, category);
    }
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
  ): Promise<{
    readonly id: string;
    readonly currency: string;
    readonly type: string;
  }> {
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

    if (payload.type === 'TRANSFER' || payload.type === 'INVESTMENT_TRANSFER') {
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
        select: { id: true, currency: true, type: true },
      });

      if (!destinationAccount) {
        throw createAccountNotFoundForTransactionException(
          payload.destinationAccountId,
        );
      }

      if (
        payload.type === 'TRANSFER' &&
        destinationAccount.currency !== account.currency
      ) {
        throw createInvalidTransferException(
          'Tracked cash transfers require accounts with the same currency.',
        );
      }

      if (
        payload.type === 'INVESTMENT_TRANSFER' &&
        (account.type !== 'CRYPTO_WALLET' ||
          destinationAccount.type !== 'CRYPTO_WALLET')
      ) {
        throw createInvalidTransferException(
          'Stablecoin transfers require two cryptocurrency wallets.',
        );
      }
    }
    return account;
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
      type === 'INVESTMENT_OPENING_POSITION' ||
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
      type === 'INVESTMENT_WITHDRAWAL' ||
      type === 'INVESTMENT_TRANSFER'
    ) {
      if (quantity.isZero() || quantity.isNegative()) {
        throw createInvalidInvestmentAmountException(
          'Quantity must be greater than zero.',
        );
      }

      if (
        type !== 'INVESTMENT_DEPOSIT' &&
        type !== 'INVESTMENT_TRANSFER' &&
        !price.isZero()
      ) {
        throw createInvalidInvestmentAmountException(
          'Price must be zero for non-cash investment transactions.',
        );
      }
    }

    if (
      type === 'INVESTMENT_OPENING_POSITION' &&
      investment.fees !== undefined &&
      !new Prisma.Decimal(investment.fees).isZero()
    ) {
      throw createInvalidInvestmentAmountException(
        'Fees must be zero for an opening position.',
      );
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
    hasSettlementAsset = false,
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

      return hasSettlementAsset ? new Prisma.Decimal(0) : cashImpact;
    }

    if (
      type === 'INVESTMENT_SPLIT' ||
      type === 'INVESTMENT_BONUS' ||
      type === 'INVESTMENT_DEPOSIT' ||
      type === 'INVESTMENT_WITHDRAWAL' ||
      type === 'INVESTMENT_TRANSFER' ||
      type === 'INVESTMENT_OPENING_POSITION'
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
    settlementAssetId: string | null = null,
  ): {
    readonly assetId: string;
    readonly settlementAssetId: string | undefined;
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
      settlementAssetId: settlementAssetId ?? undefined,
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
      case 'INVESTMENT_OPENING_POSITION':
        return 'OPENING';
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
      case 'INVESTMENT_TRANSFER':
        return 'TRANSFER';
      default:
        throw createInvalidInvestmentAmountException(
          'This transaction type does not support investment details.',
        );
    }
  }

  private async validateInvestmentAsset(
    userId: string,
    assetId: string,
  ): Promise<{
    readonly id: string;
    readonly priceCurrency: string | null;
    readonly marketType: string | null;
    readonly liquidityClass: string;
    readonly domain: 'SECURITIES' | 'CRYPTO';
  }> {
    const asset = await this.prisma.asset.findFirst({
      where: {
        id: assetId,
        userId,
      },
      select: {
        id: true,
        priceCurrency: true,
        marketType: true,
        liquidityClass: true,
        domain: true,
      },
    });

    if (!asset) {
      throw createAssetNotFoundForTransactionException(assetId);
    }

    return asset;
  }

  private assertInvestmentDomainAccountCompatibility(
    domain: 'SECURITIES' | 'CRYPTO' | undefined,
    accountType: string | undefined,
  ): void {
    if (
      (domain === 'SECURITIES' && accountType !== 'BROKER') ||
      (domain === 'CRYPTO' && accountType !== 'CRYPTO_WALLET')
    ) {
      throw createInvalidInvestmentAccountException();
    }
  }

  private async resolveSettlementAsset(
    user: AuthenticatedUser,
    input: SettlementAssetDto | undefined,
    primaryAssetId: string,
  ): Promise<string> {
    if (!input) throw settlementAssetRequiredException();
    let asset: {
      id: string;
      priceCurrency: string | null;
      liquidityClass: string;
    } | null = null;

    if (input.kind === 'EXISTING') {
      if (!input.assetId) throw settlementAssetNotFoundException();
      asset = await this.prisma.asset.findFirst({
        where: { id: input.assetId, userId: user.id },
        select: { id: true, priceCurrency: true, liquidityClass: true },
      });
    } else {
      if (!input.providerAssetId || !this.assetsService) {
        throw settlementAssetNotFoundException();
      }
      asset = await this.prisma.asset.findFirst({
        where: {
          userId: user.id,
          provider: 'COINGECKO',
          providerAssetId: input.providerAssetId,
        },
        select: { id: true, priceCurrency: true, liquidityClass: true },
      });
      if (!asset) {
        const created = await this.assetsService.createProviderAssetForUser(
          user,
          {
            type: 'CRYPTO',
            provider: 'COINGECKO',
            providerAssetId: input.providerAssetId,
          },
        );
        asset = created;
      }
    }

    if (!asset) throw settlementAssetNotFoundException(input.assetId);
    if (asset.id === primaryAssetId) {
      throw invalidSettlementAssetException(
        'An asset cannot settle against itself.',
      );
    }
    if (
      asset.priceCurrency !== 'USD' ||
      asset.liquidityClass !== 'CASH_EQUIVALENT'
    ) {
      throw invalidSettlementAssetException(
        'Settlement assets must be USD-priced cash equivalents.',
      );
    }
    return asset.id;
  }

  private async assertSufficientSettlement(
    userId: string,
    accountId: string,
    assetId: string,
    required: Prisma.Decimal,
    excludedTransactionId?: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    const details = await client.investmentTransactionDetail.findMany({
      where: {
        OR: [{ assetId }, { settlementAssetId: assetId }],
        asset: { userId },
        transactionId: excludedTransactionId
          ? { not: excludedTransactionId }
          : undefined,
        transaction: {
          accountId,
          status: 'CLEARED',
          deletedAt: null,
          reversalOfId: null,
          reversal: { is: null },
        },
      },
      select: {
        assetId: true,
        settlementAssetId: true,
        tradeType: true,
        quantity: true,
        price: true,
        fees: true,
        grossAmount: true,
      },
    });
    const holding = calculateHolding({
      currentPrice: null,
      priceCurrency: 'USD',
      transactions: holdingTransactionsForAsset(assetId, details),
    });
    if (holding.quantity.lessThan(required)) {
      throw insufficientSettlementBalanceException(
        assetId,
        holding.quantity.toString(),
        required.toString(),
      );
    }
  }

  private async assertSufficientAccountCash(
    userId: string,
    accountId: string,
    required: Prisma.Decimal,
    excludedTransactionId?: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    const account = await client.account.findFirst({
      where: { id: accountId, userId },
      select: { openingBalance: true },
    });
    if (!account) throw createAccountNotFoundForTransactionException(accountId);
    const rows = await client.transaction.findMany({
      where: {
        status: 'CLEARED',
        deletedAt: null,
        id: excludedTransactionId ? { not: excludedTransactionId } : undefined,
        OR: [{ accountId }, { destinationAccountId: accountId }],
      },
      select: {
        type: true,
        accountId: true,
        destinationAccountId: true,
        amount: true,
      },
    });
    const available = calculateAccountBalance(
      account.openingBalance,
      accountId,
      rows,
    );
    if (available.lessThan(required)) {
      throw insufficientAccountCashException(
        accountId,
        available.toString(),
        required.toString(),
      );
    }
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
    if (
      type !== 'INVESTMENT_SELL' &&
      type !== 'INVESTMENT_WITHDRAWAL' &&
      type !== 'INVESTMENT_TRANSFER'
    ) {
      return;
    }

    const holding = await this.calculateAccountHolding(
      userId,
      accountId,
      investment.assetId,
      excludedTransactionId,
    );

    if (holding.quantity.lessThan(investment.quantity)) {
      throw createInsufficientHoldingException(investment.assetId);
    }
  }

  private async calculateAccountHolding(
    userId: string,
    accountId: string | undefined,
    assetId: string,
    excludedTransactionId?: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<ReturnType<typeof calculateHolding>> {
    const details = await client.investmentTransactionDetail.findMany({
      where: {
        OR: [{ assetId }, { settlementAssetId: assetId }],
        asset: { userId },
        transactionId: excludedTransactionId
          ? { not: excludedTransactionId }
          : undefined,
        transaction: {
          status: 'CLEARED',
          deletedAt: null,
          OR: accountId
            ? [{ accountId }, { destinationAccountId: accountId }]
            : undefined,
          reversalOfId: null,
          reversal: { is: null },
        },
      },
      select: {
        assetId: true,
        settlementAssetId: true,
        tradeType: true,
        quantity: true,
        price: true,
        fees: true,
        grossAmount: true,
        transaction: {
          select: { accountId: true, destinationAccountId: true },
        },
      },
    });
    return calculateHolding({
      currentPrice: null,
      priceCurrency: null,
      transactions: holdingTransactionsForAsset(
        assetId,
        details.map((detail) => ({
          ...detail,
          transferDirection:
            detail.tradeType === 'TRANSFER' &&
            detail.transaction.destinationAccountId === accountId
              ? ('IN' as const)
              : ('OUT' as const),
        })),
      ),
    });
  }

  private async resolveInvestmentTransferBasis(
    userId: string,
    sourceAccountId: string,
    destinationAccountId: string | undefined,
    assetId: string,
    quantity: string,
    asset: {
      readonly priceCurrency: string | null;
      readonly liquidityClass: string;
    } | null,
    excludedTransactionId?: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<string> {
    if (!destinationAccountId) {
      throw createInvalidTransferException(
        'Stablecoin transfers require a destination wallet.',
      );
    }
    if (
      !asset ||
      asset.liquidityClass !== 'CASH_EQUIVALENT' ||
      asset.priceCurrency !== 'USD'
    ) {
      throw createInvalidTransferException(
        'Only USD cash-equivalent assets can be transferred between crypto wallets.',
      );
    }
    const holding = await this.calculateAccountHolding(
      userId,
      sourceAccountId,
      assetId,
      excludedTransactionId,
      client,
    );
    if (holding.quantity.lessThan(quantity)) {
      throw createInsufficientHoldingException(assetId);
    }
    return holding.averageCost?.toFixed(8) ?? '0';
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
          readonly settlementAsset?: SettlementAssetDto;
        }
      | null
      | undefined,
    priceCurrency: string,
    user: AuthenticatedUser,
    settlementAssetId: string | null,
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
      settlementAssetId,
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
      return {
        update: {
          ...detailData,
          settlementAsset: calculatedDetail.settlementAssetId
            ? { connect: { id: calculatedDetail.settlementAssetId } }
            : { disconnect: true },
        },
      };
    }

    return {
      create: {
        ...detailData,
        settlementAsset: calculatedDetail.settlementAssetId
          ? { connect: { id: calculatedDetail.settlementAssetId } }
          : undefined,
      },
    };
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

  private toAccountTransactionResponse(
    transaction: TransactionRecord,
    accountId: string,
  ): AccountTransactionResponse {
    const effect = this.getAccountEffect(transaction, accountId);
    return {
      ...this.toTransactionResponse(transaction),
      accountEffect: effect.toString(),
      accountDirection: effect.gt(0) ? 'IN' : effect.lt(0) ? 'OUT' : 'NEUTRAL',
    };
  }

  private getAccountEffect(
    transaction: {
      readonly type: TransactionType;
      readonly accountId: string;
      readonly destinationAccountId: string | null;
      readonly amount: Prisma.Decimal;
    },
    accountId: string,
  ): Prisma.Decimal {
    let effect = new Prisma.Decimal(0);
    if (transaction.accountId === accountId) {
      effect = effect.add(
        getSourceAccountEffect(transaction.type, transaction.amount),
      );
    }
    if (
      transaction.destinationAccountId === accountId &&
      hasDestinationBalanceEffect(transaction.type)
    ) {
      effect = effect.add(transaction.amount);
    }
    return effect;
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
      settlementAssetId: detail.settlementAssetId,
      settlementAssetName: detail.settlementAsset?.name ?? null,
      settlementAssetSymbol: detail.settlementAsset?.symbol ?? null,
      settlementQuantity: detail.settlementAssetId
        ? (detail.tradeType === 'BUY'
            ? detail.grossAmount.add(detail.fees)
            : detail.grossAmount.sub(detail.fees)
          ).toString()
        : null,
      pairLabel:
        detail.settlementAssetId && detail.settlementAsset?.symbol
          ? `${detail.asset.symbol ?? detail.asset.name}/${detail.settlementAsset.symbol}`
          : null,
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
  readonly merchant: string | null;
}): string {
  return (
    transaction.description ||
    transaction.merchant ||
    transaction.category ||
    'Transaction'
  );
}
