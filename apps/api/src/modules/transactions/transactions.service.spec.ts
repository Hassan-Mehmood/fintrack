import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { Prisma } from '../../generated/prisma/client';
import { TransactionsService } from './transactions.service';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';
import {
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

    service = new TransactionsService(prisma as never);
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
        tradeType: 'BUY',
        quantity: new Prisma.Decimal('10'),
        price: new Prisma.Decimal('20'),
        fees: new Prisma.Decimal('0'),
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
  type = 'EXPENSE',
}: {
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
  readonly type?: string;
} = {}) {
  return {
    id,
    type,
    accountId: 'account-1',
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
    status: 'CLEARED',
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
} = {}) {
  return {
    id: 'detail-1',
    assetId,
    asset: {
      name: assetName,
      symbol: assetSymbol,
    },
    tradeType,
    quantity: {
      toString: () => quantity,
    },
    price: {
      toString: () => price,
    },
    priceCurrency,
    grossAmount: {
      toString: () => grossAmount,
    },
    fees: {
      toString: () => fees,
    },
    fxRateUsdToPkr: null,
    fxRateSource: null,
    fxRateUpdatedAt: null,
    notes: null,
  };
}
