import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { Prisma } from '../../generated/prisma/client';
import { TransactionsService } from './transactions.service';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';
import {
  createAssetNotFoundForTransactionException,
  createAccountNotFoundForTransactionException,
  createInvalidBulkTransactionException,
  createInvalidInvestmentAmountException,
  createInvalidInvestmentTradeTypeException,
  createInvalidTransactionCategoryException,
  createInvalidTransferException,
  createInvestmentDetailRequiredException,
  createTransactionCurrencyMismatchException,
  createTransactionLockedException,
  createTransactionNotFoundException,
  createTransactionNotReversibleException,
} from './transactions.errors';
import {
  insufficientAccountCashException,
  insufficientSettlementBalanceException,
  settlementAssetRequiredException,
} from '../investments/investment-settlement.errors';

jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const authenticatedUser: AuthenticatedUser = {
  id: 'user-1',
  clerkId: 'clerk_123',
  email: 'user@example.com',
  name: 'Test User',
  baseCurrency: 'USD',
  exchangeRate: null,
  exchangeRateSource: 'MANUAL_SETTINGS',
  exchangeRateUpdatedAt: null,
};

const mockDate = new Date('2026-07-07T10:00:00.000Z');

describe('TransactionsService', () => {
  let service: TransactionsService;
  let categoriesService: {
    isAllowedForUser: jest.Mock;
  };
  let prisma: {
    account: {
      findFirst: jest.Mock;
    };
    asset: {
      findFirst: jest.Mock;
    };
    investmentTransactionDetail: {
      findMany: jest.Mock;
    };
    transaction: {
      count: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      groupBy: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      account: {
        findFirst: jest.fn(),
      },
      asset: {
        findFirst: jest.fn(),
      },
      investmentTransactionDetail: {
        findMany: jest.fn(),
      },
      transaction: {
        count: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        groupBy: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(
        async (
          operations:
            | Array<Promise<unknown>>
            | ((client: typeof prisma) => Promise<unknown>),
        ) => {
          if (typeof operations === 'function') {
            return operations(prisma);
          }

          const results: unknown[] = [];

          for (const operation of operations) {
            results.push(await operation);
          }

          return results;
        },
      ),
    };

    categoriesService = {
      isAllowedForUser: jest.fn().mockResolvedValue(true),
    };
    service = new TransactionsService(
      prisma as never,
      categoriesService as never,
    );
    jest.useFakeTimers();
    jest.setSystemTime(mockDate);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('lists user transactions ordered by date', async () => {
    prisma.transaction.findMany
      .mockResolvedValueOnce([createTransactionRecord()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prisma.transaction.count.mockResolvedValue(1);
    prisma.transaction.groupBy.mockResolvedValue([]);

    await expect(
      service.listTransactionsForUser(
        authenticatedUser,
        new ListTransactionsQueryDto(),
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            id: 'transaction-1',
            accountName: 'Primary Checking',
            amount: '100.50',
          }),
        ],
        meta: expect.objectContaining({ total: 1, page: 1, pageSize: 25 }),
      }),
    );
  });

  it('lists account-relative effects and totals cleared balance changes', async () => {
    const rows = [
      createEffectTransactionRecord({
        id: 'income',
        type: 'INCOME',
        amount: '100.5',
      }),
      createEffectTransactionRecord({
        id: 'expense',
        type: 'EXPENSE',
        amount: '25',
      }),
      createEffectTransactionRecord({
        id: 'transfer',
        type: 'TRANSFER',
        amount: '40',
        destinationAccountId: 'account-2',
        destinationAccountName: 'Savings',
      }),
      createEffectTransactionRecord({
        id: 'buy',
        type: 'INVESTMENT_BUY',
        amount: '10',
      }),
      createEffectTransactionRecord({
        id: 'adjustment',
        type: 'ADJUSTMENT',
        amount: '-5',
      }),
      createEffectTransactionRecord({
        id: 'deposit',
        type: 'INVESTMENT_DEPOSIT',
        amount: '0',
      }),
      createEffectTransactionRecord({
        id: 'pending',
        type: 'INCOME',
        amount: '1000',
        status: 'PENDING',
      }),
    ];
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      currency: 'USD',
    });
    prisma.transaction.findMany
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce(rows.slice(0, 6))
      .mockResolvedValueOnce([]);
    prisma.transaction.count.mockResolvedValue(rows.length);

    const result = await service.listAccountTransactionsForUser(
      authenticatedUser,
      'account-1',
      new ListTransactionsQueryDto(),
    );

    expect(result.meta.summary).toEqual({
      moneyIn: '100.50',
      moneyOut: '80.00',
      netCashFlow: '20.50',
      transactionCount: 7,
    });
    expect(result.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'transfer',
          accountEffect: '-40',
          accountDirection: 'OUT',
        }),
        expect.objectContaining({
          id: 'adjustment',
          accountEffect: '-5',
          accountDirection: 'OUT',
        }),
        expect.objectContaining({
          id: 'deposit',
          accountEffect: '0',
          accountDirection: 'NEUTRAL',
        }),
      ]),
    );
  });

  it('shows a transfer as an inflow for its destination account', async () => {
    const transfer = createEffectTransactionRecord({
      id: 'transfer',
      type: 'TRANSFER',
      amount: '40',
      destinationAccountId: 'account-2',
      destinationAccountName: 'Savings',
    });
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-2',
      currency: 'USD',
    });
    prisma.transaction.findMany
      .mockResolvedValueOnce([transfer])
      .mockResolvedValueOnce([transfer])
      .mockResolvedValueOnce([]);
    prisma.transaction.count.mockResolvedValue(1);

    const result = await service.listAccountTransactionsForUser(
      authenticatedUser,
      'account-2',
      new ListTransactionsQueryDto(),
    );

    expect(result.data[0]).toEqual(
      expect.objectContaining({
        accountEffect: '40',
        accountDirection: 'IN',
      }),
    );
    expect(result.meta.summary).toEqual(
      expect.objectContaining({ moneyIn: '40.00', netCashFlow: '40.00' }),
    );
  });

  it('rejects an account ledger request when the account is unowned', async () => {
    prisma.account.findFirst.mockResolvedValue(null);

    await expect(
      service.listAccountTransactionsForUser(
        authenticatedUser,
        'account-2',
        new ListTransactionsQueryDto(),
      ),
    ).rejects.toEqual(
      createAccountNotFoundForTransactionException('account-2'),
    );
  });

  it('throws when requesting a transaction not owned by the user', async () => {
    prisma.transaction.findFirst.mockResolvedValue(null);

    await expect(
      service.getTransactionForUser(authenticatedUser, 'missing-transaction'),
    ).rejects.toEqual(
      createTransactionNotFoundException('missing-transaction'),
    );
  });

  it('creates an expense transaction and deducts from account balance implicitly', async () => {
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      currency: 'USD',
    });
    let createInput: unknown;
    prisma.transaction.create.mockImplementation((input: unknown) => {
      createInput = input;
      return Promise.resolve(createTransactionRecord({ amount: '100.50' }));
    });

    const result = await service.createTransactionForUser(authenticatedUser, {
      type: 'EXPENSE',
      accountId: 'account-1',
      amount: '100.50',
      currency: 'USD',
      occurredAt: '2026-07-01T00:00:00.000Z',
      category: 'General',
      description: 'Grocery shopping',
    });

    expect(result).toEqual(
      expect.objectContaining({
        type: 'EXPENSE',
        amount: '100.50',
        accountName: 'Primary Checking',
      }),
    );

    expect(prisma.transaction.create).toHaveBeenCalledTimes(1);
    expect(createInput).toMatchObject({
      data: {
        category: 'General',
        description: 'Grocery shopping',
      },
    });
  });

  it('stores an omitted description as an empty string', async () => {
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      currency: 'USD',
    });
    let createdDescription: unknown;
    prisma.transaction.create.mockImplementation((input: unknown) => {
      const request = input as {
        readonly data: { readonly description: unknown };
      };
      createdDescription = request.data.description;
      return Promise.resolve(
        createTransactionRecord({ description: String(createdDescription) }),
      );
    });

    await service.createTransactionForUser(authenticatedUser, {
      type: 'EXPENSE',
      accountId: 'account-1',
      amount: '10',
      currency: 'USD',
      occurredAt: '2026-07-01T00:00:00.000Z',
      category: 'Groceries',
    });

    expect(createdDescription).toBe('');
  });

  it('rejects a category outside defaults and owned history', async () => {
    categoriesService.isAllowedForUser.mockResolvedValue(false);

    await expect(
      service.createTransactionForUser(authenticatedUser, {
        type: 'EXPENSE',
        accountId: 'account-1',
        amount: '10',
        currency: 'USD',
        occurredAt: '2026-07-01T00:00:00.000Z',
        category: 'Private category',
      }),
    ).rejects.toEqual(
      createInvalidTransactionCategoryException('EXPENSE', 'Private category'),
    );
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it('rejects a mixed-type bulk category unavailable to every type', async () => {
    prisma.transaction.findMany.mockResolvedValue([
      {
        id: 'expense',
        type: 'EXPENSE',
        labels: [],
        reversalOfId: null,
        reversal: null,
      },
      {
        id: 'income',
        type: 'INCOME',
        labels: [],
        reversalOfId: null,
        reversal: null,
      },
    ]);
    categoriesService.isAllowedForUser
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(
      service.bulkUpdateTransactionsForUser(authenticatedUser, {
        transactionIds: ['expense', 'income'],
        category: 'Housing',
      }),
    ).rejects.toEqual(
      createInvalidBulkTransactionException(
        'Select a category available for every selected transaction type.',
      ),
    );
    expect(categoriesService.isAllowedForUser).toHaveBeenCalledTimes(2);
    expect(prisma.transaction.update).not.toHaveBeenCalled();
  });

  it('creates a transfer between two owned accounts', async () => {
    prisma.account.findFirst
      .mockResolvedValueOnce({ id: 'account-1', currency: 'USD' })
      .mockResolvedValueOnce({ id: 'account-2', currency: 'USD' });
    prisma.transaction.create.mockResolvedValue(
      createTransactionRecord({
        type: 'TRANSFER',
        destinationAccountId: 'account-2',
        destinationAccountName: 'Savings',
      }),
    );

    const result = await service.createTransactionForUser(authenticatedUser, {
      type: 'TRANSFER',
      accountId: 'account-1',
      destinationAccountId: 'account-2',
      amount: '500',
      currency: 'USD',
      occurredAt: '2026-07-01T00:00:00.000Z',
      category: 'General',
      description: 'Transfer to savings',
    });

    expect(result).toEqual(
      expect.objectContaining({
        type: 'TRANSFER',
        destinationAccountId: 'account-2',
        destinationAccountName: 'Savings',
      }),
    );
  });

  it('rejects a transfer to the same account', async () => {
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      currency: 'USD',
    });

    await expect(
      service.createTransactionForUser(authenticatedUser, {
        type: 'TRANSFER',
        accountId: 'account-1',
        destinationAccountId: 'account-1',
        amount: '500',
        currency: 'USD',
        occurredAt: '2026-07-01T00:00:00.000Z',
        category: 'General',
        description: 'Invalid transfer',
      }),
    ).rejects.toEqual(
      createInvalidTransferException(
        'The destination account must be different from the source account.',
      ),
    );
  });

  it('rejects a transaction when the currency does not match the account currency', async () => {
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      currency: 'PKR',
    });

    await expect(
      service.createTransactionForUser(authenticatedUser, {
        type: 'EXPENSE',
        accountId: 'account-1',
        amount: '100',
        currency: 'USD',
        occurredAt: '2026-07-01T00:00:00.000Z',
        category: 'General',
        description: 'Wrong currency',
      }),
    ).rejects.toEqual(createTransactionCurrencyMismatchException('PKR', 'USD'));

    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it('creates an investment buy transaction with asset details', async () => {
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      currency: 'USD',
    });
    prisma.asset.findFirst.mockResolvedValue({ id: 'asset-1' });
    prisma.transaction.create.mockResolvedValue(
      createTransactionRecord({
        type: 'INVESTMENT_BUY',
        amount: '1010',
        investmentDetail: createInvestmentDetailRecord(),
      }),
    );

    const result = await service.createTransactionForUser(authenticatedUser, {
      type: 'INVESTMENT_BUY',
      accountId: 'account-1',
      amount: '1',
      currency: 'USD',
      occurredAt: '2026-07-01T00:00:00.000Z',
      category: 'General',
      description: 'Buy BTC',
      investment: {
        assetId: 'asset-1',
        tradeType: 'BUY',
        quantity: '0.015',
        price: '67000',
        fees: '5',
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        type: 'INVESTMENT_BUY',
        investmentDetail: expect.objectContaining({
          assetId: 'asset-1',
          tradeType: 'BUY',
          quantity: '0.015',
        }),
      }),
    );
    expect(prisma.transaction.create).toHaveBeenCalledTimes(1);
    const createCall: unknown = prisma.transaction.create.mock.lastCall?.[0];
    expect(createCall).toMatchObject({
      data: {
        amount: new Prisma.Decimal('1010'),
        investmentDetail: {
          create: {
            grossAmount: new Prisma.Decimal('1005'),
          },
        },
      },
    });
  });

  it('records both sides of a crypto purchase settled with USDT', async () => {
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      currency: 'USD',
      type: 'CRYPTO_WALLET',
    });
    prisma.asset.findFirst
      .mockResolvedValueOnce({
        id: 'asset-1',
        priceCurrency: 'USD',
        marketType: 'CRYPTO',
      })
      .mockResolvedValueOnce({
        id: 'usdt',
        priceCurrency: 'USD',
        liquidityClass: 'CASH_EQUIVALENT',
      });
    prisma.investmentTransactionDetail.findMany.mockResolvedValue([
      {
        assetId: 'usdt',
        settlementAssetId: null,
        tradeType: 'OPENING',
        quantity: new Prisma.Decimal('2000'),
        price: new Prisma.Decimal('1'),
        fees: new Prisma.Decimal('0'),
        grossAmount: new Prisma.Decimal('2000'),
      },
    ]);
    prisma.transaction.create.mockResolvedValue(
      createTransactionRecord({
        type: 'INVESTMENT_BUY',
        amount: '0',
        investmentDetail: createInvestmentDetailRecord({
          settlementAssetId: 'usdt',
          settlementAssetSymbol: 'USDT',
          quantity: '0.02',
          price: '50000',
          fees: '2',
          grossAmount: '1000',
        }),
      }),
    );

    const result = await service.createTransactionForUser(authenticatedUser, {
      type: 'INVESTMENT_BUY',
      accountId: 'account-1',
      currency: 'USD',
      occurredAt: '2026-07-01T00:00:00.000Z',
      category: 'General',
      investment: {
        assetId: 'asset-1',
        tradeType: 'BUY',
        quantity: '0.02',
        price: '50000',
        fees: '2',
        settlementAsset: { kind: 'EXISTING', assetId: 'usdt' },
      },
    });

    expect(result.amount).toBe('0');
    expect(result.investmentDetail).toEqual(
      expect.objectContaining({
        pairLabel: 'BTC/USDT',
        settlementQuantity: '1002',
      }),
    );
    expect(prisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: new Prisma.Decimal(0),
          investmentDetail: {
            create: expect.objectContaining({ settlementAssetId: 'usdt' }),
          },
        }),
      }),
    );
  });

  it('requires a settlement asset for a crypto-wallet trade', async () => {
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      currency: 'USD',
      type: 'CRYPTO_WALLET',
    });
    prisma.asset.findFirst.mockResolvedValue({
      id: 'asset-1',
      priceCurrency: 'USD',
      marketType: 'CRYPTO',
    });

    await expect(
      service.createTransactionForUser(authenticatedUser, {
        type: 'INVESTMENT_BUY',
        accountId: 'account-1',
        currency: 'USD',
        occurredAt: '2026-07-01T00:00:00.000Z',
        category: 'General',
        investment: {
          assetId: 'asset-1',
          tradeType: 'BUY',
          quantity: '0.02',
          price: '50000',
          fees: '2',
        },
      }),
    ).rejects.toEqual(settlementAssetRequiredException());
  });

  it('rejects a crypto purchase with insufficient stablecoin balance', async () => {
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      currency: 'USD',
      type: 'CRYPTO_WALLET',
    });
    prisma.asset.findFirst
      .mockResolvedValueOnce({
        id: 'asset-1',
        priceCurrency: 'USD',
        marketType: 'CRYPTO',
      })
      .mockResolvedValueOnce({
        id: 'usdt',
        priceCurrency: 'USD',
        liquidityClass: 'CASH_EQUIVALENT',
      });
    prisma.investmentTransactionDetail.findMany.mockResolvedValue([
      {
        assetId: 'usdt',
        settlementAssetId: null,
        tradeType: 'OPENING',
        quantity: new Prisma.Decimal('500'),
        price: new Prisma.Decimal('1'),
        fees: new Prisma.Decimal('0'),
        grossAmount: new Prisma.Decimal('500'),
      },
    ]);

    await expect(
      service.createTransactionForUser(authenticatedUser, {
        type: 'INVESTMENT_BUY',
        accountId: 'account-1',
        currency: 'USD',
        occurredAt: '2026-07-01T00:00:00.000Z',
        category: 'General',
        investment: {
          assetId: 'asset-1',
          tradeType: 'BUY',
          quantity: '0.02',
          price: '50000',
          fees: '2',
          settlementAsset: { kind: 'EXISTING', assetId: 'usdt' },
        },
      }),
    ).rejects.toEqual(
      insufficientSettlementBalanceException('usdt', '500', '1002'),
    );
  });

  it('rejects a broker purchase with insufficient Cash', async () => {
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      currency: 'USD',
      type: 'BROKER',
      openingBalance: new Prisma.Decimal('100'),
    });
    prisma.asset.findFirst.mockResolvedValue({
      id: 'asset-1',
      priceCurrency: 'USD',
      marketType: 'STOCK',
    });
    prisma.transaction.findMany.mockResolvedValue([]);

    await expect(
      service.createTransactionForUser(authenticatedUser, {
        type: 'INVESTMENT_BUY',
        accountId: 'account-1',
        currency: 'USD',
        occurredAt: '2026-07-01T00:00:00.000Z',
        category: 'General',
        investment: {
          assetId: 'asset-1',
          tradeType: 'BUY',
          quantity: '2',
          price: '100',
          fees: '5',
        },
      }),
    ).rejects.toEqual(
      insufficientAccountCashException('account-1', '100', '205'),
    );
  });

  it('creates an opening position with basis and no account cash impact', async () => {
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      currency: 'USD',
    });
    prisma.asset.findFirst.mockResolvedValue({
      id: 'asset-1',
      priceCurrency: 'USD',
    });
    prisma.transaction.create.mockResolvedValue(
      createTransactionRecord({
        type: 'INVESTMENT_OPENING_POSITION',
        amount: '0',
        investmentDetail: createInvestmentDetailRecord({
          tradeType: 'OPENING',
          quantity: '100',
          price: '12',
          fees: '0',
          grossAmount: '1200',
        }),
      }),
    );

    await service.createTransactionForUser(authenticatedUser, {
      type: 'INVESTMENT_OPENING_POSITION',
      accountId: 'account-1',
      currency: 'USD',
      occurredAt: '2026-07-01T00:00:00.000Z',
      category: 'Opening position',
      description: 'Existing position',
      investment: {
        assetId: 'asset-1',
        tradeType: 'OPENING',
        quantity: '100',
        price: '12',
        fees: '0',
      },
    });

    const createCall: unknown = prisma.transaction.create.mock.lastCall?.[0];
    expect(createCall).toMatchObject({
      data: {
        amount: new Prisma.Decimal(0),
        investmentDetail: {
          create: {
            tradeType: 'OPENING',
            grossAmount: new Prisma.Decimal(1200),
            fees: '0',
          },
        },
      },
    });
  });

  it('converts a native USD purchase into a PKR account and stores the FX snapshot', async () => {
    const userWithRate: AuthenticatedUser = {
      ...authenticatedUser,
      baseCurrency: 'PKR',
      exchangeRate: '280',
      exchangeRateUpdatedAt: '2026-07-01T08:00:00.000Z',
    };
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      currency: 'PKR',
    });
    prisma.asset.findFirst.mockResolvedValue({
      id: 'asset-1',
      priceCurrency: 'USD',
    });
    prisma.transaction.create.mockResolvedValue(
      createTransactionRecord({
        type: 'INVESTMENT_BUY',
        amount: '280010',
        investmentDetail: createInvestmentDetailRecord(),
      }),
    );

    await service.createTransactionForUser(userWithRate, {
      type: 'INVESTMENT_BUY',
      accountId: 'account-1',
      currency: 'PKR',
      occurredAt: '2026-07-01T00:00:00.000Z',
      category: 'General',
      description: 'Cross-currency purchase',
      investment: {
        assetId: 'asset-1',
        tradeType: 'BUY',
        quantity: '1',
        price: '1000',
        fees: '10',
      },
    });

    const createCall: unknown = prisma.transaction.create.mock.lastCall?.[0];
    expect(createCall).toMatchObject({
      data: {
        amount: new Prisma.Decimal('280010'),
        investmentDetail: {
          create: {
            priceCurrency: 'USD',
            grossAmount: new Prisma.Decimal('1000'),
            fxRateUsdToPkr: '280',
            fxRateSource: 'MANUAL_SETTINGS',
            fxRateUpdatedAt: new Date('2026-07-01T08:00:00.000Z'),
          },
        },
      },
    });
  });

  it('calculates net sale proceeds and rejects client-provided totals', async () => {
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      currency: 'USD',
    });
    prisma.asset.findFirst.mockResolvedValue({ id: 'asset-1' });
    prisma.investmentTransactionDetail.findMany.mockResolvedValue([
      {
        assetId: 'asset-1',
        settlementAssetId: null,
        tradeType: 'BUY',
        quantity: new Prisma.Decimal('10'),
        price: new Prisma.Decimal('20'),
        fees: new Prisma.Decimal('0'),
        grossAmount: new Prisma.Decimal('200'),
      },
    ]);
    prisma.transaction.create.mockResolvedValue(
      createTransactionRecord({
        type: 'INVESTMENT_SELL',
        amount: '58',
        investmentDetail: createInvestmentDetailRecord({
          tradeType: 'SELL',
          quantity: '3',
          price: '20',
          fees: '2',
          grossAmount: '60',
        }),
      }),
    );

    await service.createTransactionForUser(authenticatedUser, {
      type: 'INVESTMENT_SELL',
      accountId: 'account-1',
      amount: '9999',
      currency: 'USD',
      occurredAt: '2026-07-01T00:00:00.000Z',
      category: 'General',
      description: 'Partial sale',
      investment: {
        assetId: 'asset-1',
        tradeType: 'SELL',
        quantity: '3',
        price: '20',
        fees: '2',
      },
    });

    const createCall: unknown = prisma.transaction.create.mock.lastCall?.[0];
    expect(createCall).toMatchObject({
      data: {
        amount: new Prisma.Decimal('58'),
        investmentDetail: {
          create: {
            grossAmount: new Prisma.Decimal('60'),
          },
        },
      },
    });
  });

  it('rejects a sale when fees exceed gross proceeds', async () => {
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      currency: 'USD',
    });
    prisma.asset.findFirst.mockResolvedValue({ id: 'asset-1' });
    prisma.investmentTransactionDetail.findMany.mockResolvedValue([
      {
        tradeType: 'BUY',
        quantity: new Prisma.Decimal('10'),
        price: new Prisma.Decimal('20'),
        fees: new Prisma.Decimal('0'),
      },
    ]);

    await expect(
      service.createTransactionForUser(authenticatedUser, {
        type: 'INVESTMENT_SELL',
        accountId: 'account-1',
        currency: 'USD',
        occurredAt: '2026-07-01T00:00:00.000Z',
        category: 'General',
        description: 'Invalid sale',
        investment: {
          assetId: 'asset-1',
          tradeType: 'SELL',
          quantity: '1',
          price: '1',
          fees: '2',
        },
      }),
    ).rejects.toEqual(
      createInvalidInvestmentAmountException(
        'Fees cannot exceed gross sale proceeds.',
      ),
    );
  });

  it('rejects an investment buy without investment details', async () => {
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      currency: 'USD',
    });

    await expect(
      service.createTransactionForUser(authenticatedUser, {
        type: 'INVESTMENT_BUY',
        accountId: 'account-1',
        amount: '1000',
        currency: 'USD',
        occurredAt: '2026-07-01T00:00:00.000Z',
        category: 'General',
        description: 'Buy BTC',
      }),
    ).rejects.toEqual(
      createInvestmentDetailRequiredException('INVESTMENT_BUY'),
    );

    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it('rejects an investment buy with the wrong trade type', async () => {
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      currency: 'USD',
    });

    await expect(
      service.createTransactionForUser(authenticatedUser, {
        type: 'INVESTMENT_BUY',
        accountId: 'account-1',
        amount: '1000',
        currency: 'USD',
        occurredAt: '2026-07-01T00:00:00.000Z',
        category: 'General',
        description: 'Buy BTC',
        investment: {
          assetId: 'asset-1',
          tradeType: 'SELL',
          quantity: '0.015',
          price: '67000',
        },
      }),
    ).rejects.toEqual(createInvalidInvestmentTradeTypeException('BUY', 'SELL'));
  });

  it('rejects an investment transaction with an asset not owned by the user', async () => {
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      currency: 'USD',
    });
    prisma.asset.findFirst.mockResolvedValue(null);

    await expect(
      service.createTransactionForUser(authenticatedUser, {
        type: 'INVESTMENT_BUY',
        accountId: 'account-1',
        amount: '1000',
        currency: 'USD',
        occurredAt: '2026-07-01T00:00:00.000Z',
        category: 'General',
        description: 'Buy BTC',
        investment: {
          assetId: 'asset-1',
          tradeType: 'BUY',
          quantity: '0.015',
          price: '67000',
        },
      }),
    ).rejects.toEqual(createAssetNotFoundForTransactionException('asset-1'));
  });

  it('rejects an investment transaction with a non-positive quantity', async () => {
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      currency: 'USD',
    });

    await expect(
      service.createTransactionForUser(authenticatedUser, {
        type: 'INVESTMENT_BUY',
        accountId: 'account-1',
        amount: '1000',
        currency: 'USD',
        occurredAt: '2026-07-01T00:00:00.000Z',
        category: 'General',
        description: 'Buy BTC',
        investment: {
          assetId: 'asset-1',
          tradeType: 'BUY',
          quantity: '0',
          price: '67000',
        },
      }),
    ).rejects.toEqual(
      createInvalidInvestmentAmountException(
        'Quantity must be greater than zero.',
      ),
    );
  });

  it('updates an owned transaction', async () => {
    prisma.transaction.findFirst.mockResolvedValue(createTransactionRecord());
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      currency: 'USD',
    });
    prisma.transaction.update.mockResolvedValue(
      createTransactionRecord({ description: 'Updated description' }),
    );

    const result = await service.updateTransactionForUser(
      authenticatedUser,
      'transaction-1',
      {
        category: 'General',
        description: 'Updated description',
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        category: 'General',
        description: 'Updated description',
      }),
    );
  });

  it('clears an existing description to an empty string', async () => {
    prisma.transaction.findFirst.mockResolvedValue(createTransactionRecord());
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      currency: 'USD',
    });
    let updatedDescription: unknown;
    prisma.transaction.update.mockImplementation((input: unknown) => {
      const request = input as {
        readonly data: { readonly description: unknown };
      };
      updatedDescription = request.data.description;
      return Promise.resolve(createTransactionRecord({ description: '' }));
    });

    const result = await service.updateTransactionForUser(
      authenticatedUser,
      'transaction-1',
      { description: '' },
    );

    expect(updatedDescription).toBe('');
    expect(result.description).toBe('');
  });

  it('removes an optional dividend asset link when it is cleared', async () => {
    prisma.transaction.findFirst.mockResolvedValue(
      createTransactionRecord({
        type: 'DIVIDEND',
        amount: '25',
        investmentDetail: createInvestmentDetailRecord({
          tradeType: 'DIVIDEND',
          quantity: '0',
          price: '0',
          fees: '0',
          grossAmount: '0',
        }),
      }),
    );
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      currency: 'USD',
    });
    prisma.transaction.update.mockResolvedValue(
      createTransactionRecord({
        type: 'DIVIDEND',
        amount: '25',
        investmentDetail: null,
      }),
    );

    await service.updateTransactionForUser(authenticatedUser, 'transaction-1', {
      investment: null,
    });

    const updateCall: unknown = prisma.transaction.update.mock.lastCall?.[0];
    expect(updateCall).toMatchObject({
      data: {
        investmentDetail: { delete: true },
      },
    });
  });

  it('prevents updating a reversed transaction', async () => {
    prisma.transaction.findFirst.mockResolvedValue(
      createTransactionRecord({ reversedById: 'transaction-2' }),
    );

    await expect(
      service.updateTransactionForUser(authenticatedUser, 'transaction-1', {
        category: 'General',
        description: 'Updated',
      }),
    ).rejects.toEqual(createTransactionLockedException('transaction-1'));

    expect(prisma.transaction.update).not.toHaveBeenCalled();
  });

  it('reverses an expense transaction with a linked corrective entry', async () => {
    prisma.transaction.findFirst.mockResolvedValue(
      createTransactionRecord({ type: 'EXPENSE', amount: '200' }),
    );
    prisma.transaction.create.mockResolvedValue(
      createTransactionRecord({
        id: 'transaction-reversal',
        type: 'EXPENSE',
        amount: '-200',
        reversalOfId: 'transaction-1',
      }),
    );

    const result = await service.reverseTransactionForUser(
      authenticatedUser,
      'transaction-1',
    );

    expect(result).toEqual(
      expect.objectContaining({
        type: 'EXPENSE',
        amount: '-200',
        reversalOfId: 'transaction-1',
      }),
    );

    expect(prisma.transaction.create).toHaveBeenCalledTimes(1);
  });

  it('reverses an investment transaction and copies investment details', async () => {
    prisma.transaction.findFirst.mockResolvedValue(
      createTransactionRecord({
        type: 'INVESTMENT_BUY',
        amount: '1005',
        investmentDetail: createInvestmentDetailRecord(),
      }),
    );
    prisma.transaction.create.mockResolvedValue(
      createTransactionRecord({
        id: 'transaction-reversal',
        type: 'INVESTMENT_BUY',
        amount: '-1005',
        reversalOfId: 'transaction-1',
        investmentDetail: createInvestmentDetailRecord(),
      }),
    );

    const result = await service.reverseTransactionForUser(
      authenticatedUser,
      'transaction-1',
    );

    expect(result).toEqual(
      expect.objectContaining({
        type: 'INVESTMENT_BUY',
        amount: '-1005',
        reversalOfId: 'transaction-1',
        investmentDetail: expect.objectContaining({
          assetId: 'asset-1',
          tradeType: 'BUY',
        }),
      }),
    );
  });

  it('rejects reversing a transfer', async () => {
    prisma.transaction.findFirst.mockResolvedValue(
      createTransactionRecord({ type: 'TRANSFER' }),
    );

    await expect(
      service.reverseTransactionForUser(authenticatedUser, 'transaction-1'),
    ).rejects.toEqual(createTransactionNotReversibleException('transaction-1'));
  });

  it('rejects reversing an already reversed transaction', async () => {
    prisma.transaction.findFirst.mockResolvedValue(
      createTransactionRecord({ reversedById: 'transaction-2' }),
    );

    await expect(
      service.reverseTransactionForUser(authenticatedUser, 'transaction-1'),
    ).rejects.toEqual(createTransactionLockedException('transaction-1'));
  });

  it('deletes a transaction and restores the account balance implicitly', async () => {
    prisma.transaction.findFirst.mockResolvedValue(createTransactionRecord());
    prisma.transaction.update.mockResolvedValue({ id: 'transaction-1' });

    await expect(
      service.deleteTransactionForUser(authenticatedUser, 'transaction-1'),
    ).resolves.toBeUndefined();

    expect(prisma.transaction.update).toHaveBeenCalledWith({
      where: {
        id: 'transaction-1',
      },
      data: {
        status: 'VOIDED',
        deletedAt: mockDate,
      },
    });
  });

  it('prevents deleting a reversed transaction', async () => {
    prisma.transaction.findFirst.mockResolvedValue(
      createTransactionRecord({ reversedById: 'transaction-2' }),
    );

    await expect(
      service.deleteTransactionForUser(authenticatedUser, 'transaction-1'),
    ).rejects.toEqual(createTransactionLockedException('transaction-1'));

    expect(prisma.transaction.delete).not.toHaveBeenCalled();
  });

  it('creates a dividend transaction with asset details', async () => {
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      currency: 'USD',
    });
    prisma.asset.findFirst.mockResolvedValue({ id: 'asset-1' });
    prisma.transaction.create.mockResolvedValue(
      createTransactionRecord({
        type: 'DIVIDEND',
        amount: '100',
        investmentDetail: createInvestmentDetailRecord({
          tradeType: 'DIVIDEND',
          quantity: '0',
          price: '0',
          fees: '0',
        }),
      }),
    );

    const result = await service.createTransactionForUser(authenticatedUser, {
      type: 'DIVIDEND',
      accountId: 'account-1',
      amount: '100',
      currency: 'USD',
      occurredAt: '2026-07-01T00:00:00.000Z',
      category: 'General',
      description: 'AAPL dividend',
      investment: {
        assetId: 'asset-1',
        tradeType: 'DIVIDEND',
        quantity: '0',
        price: '0',
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        type: 'DIVIDEND',
        investmentDetail: expect.objectContaining({
          assetId: 'asset-1',
          tradeType: 'DIVIDEND',
        }),
      }),
    );
  });

  it('creates a dividend without a related asset', async () => {
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      currency: 'USD',
    });
    prisma.transaction.create.mockResolvedValue(
      createTransactionRecord({
        type: 'DIVIDEND',
        amount: '25',
      }),
    );

    await service.createTransactionForUser(authenticatedUser, {
      type: 'DIVIDEND',
      accountId: 'account-1',
      amount: '25',
      currency: 'USD',
      occurredAt: '2026-07-01T00:00:00.000Z',
      category: 'General',
      description: 'Fund distribution',
    });

    expect(prisma.asset.findFirst).not.toHaveBeenCalled();
    const createCall: unknown = prisma.transaction.create.mock.lastCall?.[0];
    expect(createCall).toMatchObject({
      data: {
        investmentDetail: undefined,
      },
    });
  });

  it('creates a stock split transaction', async () => {
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      currency: 'USD',
    });
    prisma.asset.findFirst.mockResolvedValue({ id: 'asset-1' });
    prisma.transaction.create.mockResolvedValue(
      createTransactionRecord({
        type: 'INVESTMENT_SPLIT',
        amount: '0',
        investmentDetail: createInvestmentDetailRecord({
          tradeType: 'SPLIT',
          quantity: '2',
          price: '0',
          fees: '0',
        }),
      }),
    );

    const result = await service.createTransactionForUser(authenticatedUser, {
      type: 'INVESTMENT_SPLIT',
      accountId: 'account-1',
      amount: '0',
      currency: 'USD',
      occurredAt: '2026-07-01T00:00:00.000Z',
      category: 'General',
      description: '2-for-1 stock split',
      investment: {
        assetId: 'asset-1',
        tradeType: 'SPLIT',
        quantity: '2',
        price: '0',
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        type: 'INVESTMENT_SPLIT',
        investmentDetail: expect.objectContaining({
          tradeType: 'SPLIT',
          quantity: '2',
        }),
      }),
    );
  });

  it('creates a non-cash asset deposit without amount or price inputs', async () => {
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      currency: 'USD',
    });
    prisma.asset.findFirst.mockResolvedValue({ id: 'asset-1' });
    prisma.transaction.create.mockResolvedValue(
      createTransactionRecord({
        type: 'INVESTMENT_DEPOSIT',
        amount: '0',
        investmentDetail: createInvestmentDetailRecord({
          tradeType: 'DEPOSIT',
          quantity: '0.125',
          price: '0',
          fees: '0',
          grossAmount: '0',
        }),
      }),
    );

    await service.createTransactionForUser(authenticatedUser, {
      type: 'INVESTMENT_DEPOSIT',
      accountId: 'account-1',
      currency: 'USD',
      occurredAt: '2026-07-01T00:00:00.000Z',
      category: 'General',
      description: 'Transfer shares in',
      investment: {
        assetId: 'asset-1',
        tradeType: 'DEPOSIT',
        quantity: '0.125',
      },
    });

    const createCall: unknown = prisma.transaction.create.mock.lastCall?.[0];
    expect(createCall).toMatchObject({
      data: {
        amount: new Prisma.Decimal(0),
        investmentDetail: {
          create: {
            grossAmount: new Prisma.Decimal(0),
            price: '0',
          },
        },
      },
    });
  });

  it('moves a stablecoin between crypto wallets with server-derived basis', async () => {
    prisma.account.findFirst
      .mockResolvedValueOnce({
        id: 'wallet-1',
        currency: 'USD',
        type: 'CRYPTO_WALLET',
      })
      .mockResolvedValueOnce({
        id: 'wallet-2',
        currency: 'USD',
        type: 'CRYPTO_WALLET',
      });
    prisma.asset.findFirst.mockResolvedValue({
      id: 'usdt',
      priceCurrency: 'USD',
      marketType: 'CRYPTO',
      liquidityClass: 'CASH_EQUIVALENT',
    });
    prisma.investmentTransactionDetail.findMany.mockResolvedValue([
      {
        assetId: 'usdt',
        settlementAssetId: null,
        tradeType: 'OPENING',
        quantity: new Prisma.Decimal('100'),
        price: new Prisma.Decimal('0.98'),
        fees: new Prisma.Decimal(0),
        grossAmount: new Prisma.Decimal('98'),
        transaction: {
          accountId: 'wallet-1',
          destinationAccountId: null,
        },
      },
    ]);
    prisma.transaction.create.mockResolvedValue(
      createTransactionRecord({
        type: 'INVESTMENT_TRANSFER',
        accountId: 'wallet-1',
        destinationAccountId: 'wallet-2',
        destinationAccountName: 'Cold wallet',
        amount: '0',
        investmentDetail: createInvestmentDetailRecord({
          assetId: 'usdt',
          tradeType: 'TRANSFER',
          quantity: '25',
          price: '0.98',
          grossAmount: '24.5',
        }),
      }),
    );

    await service.createTransactionForUser(authenticatedUser, {
      idempotencyKey: '00000000-0000-4000-8000-000000000099',
      type: 'INVESTMENT_TRANSFER',
      accountId: 'wallet-1',
      destinationAccountId: 'wallet-2',
      currency: 'USD',
      occurredAt: '2026-07-01T00:00:00.000Z',
      category: 'Asset transfer',
      investment: {
        assetId: 'usdt',
        tradeType: 'TRANSFER',
        quantity: '25',
      },
    });

    expect(prisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: new Prisma.Decimal(0),
          destinationAccountId: 'wallet-2',
          investmentDetail: {
            create: expect.objectContaining({
              tradeType: 'TRANSFER',
              price: '0.98000000',
              grossAmount: new Prisma.Decimal('24.5'),
            }),
          },
        }),
      }),
    );
  });

  it('rejects a split transaction with a non-positive ratio', async () => {
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      currency: 'USD',
    });

    await expect(
      service.createTransactionForUser(authenticatedUser, {
        type: 'INVESTMENT_SPLIT',
        accountId: 'account-1',
        amount: '0',
        currency: 'USD',
        occurredAt: '2026-07-01T00:00:00.000Z',
        category: 'General',
        description: 'Invalid split',
        investment: {
          assetId: 'asset-1',
          tradeType: 'SPLIT',
          quantity: '0',
          price: '0',
        },
      }),
    ).rejects.toEqual(
      createInvalidInvestmentAmountException(
        'Quantity must be greater than zero.',
      ),
    );
  });

  it('rejects a dividend transaction with a non-zero quantity', async () => {
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      currency: 'USD',
    });

    await expect(
      service.createTransactionForUser(authenticatedUser, {
        type: 'DIVIDEND',
        accountId: 'account-1',
        amount: '100',
        currency: 'USD',
        occurredAt: '2026-07-01T00:00:00.000Z',
        category: 'General',
        description: 'Invalid dividend',
        investment: {
          assetId: 'asset-1',
          tradeType: 'DIVIDEND',
          quantity: '1',
          price: '0',
        },
      }),
    ).rejects.toEqual(
      createInvalidInvestmentAmountException(
        'Quantity must be zero for dividend and interest transactions.',
      ),
    );
  });
});

function createTransactionRecord({
  accountId = 'account-1',
  amount = '100.50',
  category = 'General',
  createdAt = new Date('2026-07-01T10:00:00.000Z'),
  description = 'Test transaction',
  destinationAccountId = null,
  destinationAccountName = null,
  id = 'transaction-1',
  investmentDetail = null,
  reversalOfId = null,
  reversedById = null,
  status = 'CLEARED',
  type = 'EXPENSE',
}: {
  readonly accountId?: string;
  readonly amount?: string;
  readonly category?: string;
  readonly createdAt?: Date;
  readonly description?: string;
  readonly destinationAccountId?: string | null;
  readonly destinationAccountName?: string | null;
  readonly id?: string;
  readonly investmentDetail?: ReturnType<
    typeof createInvestmentDetailRecord
  > | null;
  readonly reversalOfId?: string | null;
  readonly reversedById?: string | null;
  readonly status?: string;
  readonly type?: string;
} = {}) {
  return {
    id,
    type,
    accountId,
    account: {
      name: 'Primary Checking',
      currency: 'USD',
    },
    destinationAccountId,
    destinationAccount: destinationAccountName
      ? { name: destinationAccountName }
      : null,
    reversalOfId,
    reversal: reversedById ? { id: reversedById } : null,
    amount: {
      toString: () => amount,
    },
    currency: 'USD',
    occurredAt: new Date('2026-07-01T00:00:00.000Z'),
    category,
    description,
    status,
    merchant: null,
    notes: null,
    reference: null,
    labels: [],
    deletedAt: null,
    investmentDetail,
    createdAt,
    updatedAt: new Date('2026-07-02T10:00:00.000Z'),
  };
}

function createEffectTransactionRecord(
  options: Parameters<typeof createTransactionRecord>[0] = {},
) {
  const record = createTransactionRecord(options);
  return {
    ...record,
    amount: new Prisma.Decimal(record.amount.toString()),
  };
}

function createInvestmentDetailRecord({
  assetId = 'asset-1',
  assetName = 'Bitcoin',
  assetSymbol = 'BTC',
  fees = '5',
  grossAmount = '1005',
  price = '67000',
  quantity = '0.015',
  tradeType = 'BUY',
  priceCurrency = 'USD',
  settlementAssetId = null,
  settlementAssetSymbol = null,
}: {
  readonly assetId?: string;
  readonly assetName?: string;
  readonly assetSymbol?: string;
  readonly fees?: string;
  readonly grossAmount?: string;
  readonly price?: string;
  readonly quantity?: string;
  readonly tradeType?: string;
  readonly priceCurrency?: string;
  readonly settlementAssetId?: string | null;
  readonly settlementAssetSymbol?: string | null;
} = {}) {
  return {
    id: 'detail-1',
    assetId,
    asset: {
      name: assetName,
      symbol: assetSymbol,
    },
    settlementAssetId,
    settlementAsset: settlementAssetId
      ? {
          name: settlementAssetSymbol ?? 'Stablecoin',
          symbol: settlementAssetSymbol,
        }
      : null,
    tradeType,
    quantity: new Prisma.Decimal(quantity),
    price: new Prisma.Decimal(price),
    priceCurrency,
    grossAmount: new Prisma.Decimal(grossAmount),
    fees: new Prisma.Decimal(fees),
    fxRateUsdToPkr: null,
    fxRateSource: null,
    fxRateUpdatedAt: null,
    notes: null,
  };
}
