import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { TransactionsService } from './transactions.service';
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
    transaction: {
      create: jest.Mock;
      delete: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
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
      transaction: {
        create: jest.fn(),
        delete: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (operations: Array<Promise<unknown>>) => {
        const results: unknown[] = [];

        for (const operation of operations) {
          results.push(await operation);
        }

        return results;
      }),
    };

    service = new TransactionsService(prisma as never);
    jest.useFakeTimers();
    jest.setSystemTime(mockDate);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('lists user transactions ordered by date', async () => {
    prisma.transaction.findMany.mockResolvedValue([createTransactionRecord()]);

    await expect(
      service.listTransactionsForUser(authenticatedUser),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'transaction-1',
        accountName: 'Primary Checking',
        amount: '100.50',
      }),
    ]);
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
    prisma.transaction.create.mockResolvedValue(
      createTransactionRecord({ amount: '100.50' }),
    );

    const result = await service.createTransactionForUser(authenticatedUser, {
      type: 'EXPENSE',
      accountId: 'account-1',
      amount: '100.50',
      currency: 'USD',
      occurredAt: '2026-07-01T00:00:00.000Z',
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
        amount: '1005',
        investmentDetail: createInvestmentDetailRecord(),
      }),
    );

    const result = await service.createTransactionForUser(authenticatedUser, {
      type: 'INVESTMENT_BUY',
      accountId: 'account-1',
      amount: '1005',
      currency: 'USD',
      occurredAt: '2026-07-01T00:00:00.000Z',
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
        description: 'Buy BTC',
        investment: {
          assetId: 'asset-1',
          tradeType: 'BUY',
          quantity: '0',
          price: '67000',
        },
      }),
    ).rejects.toEqual(
      createInvalidInvestmentAmountException('Quantity must be greater than zero.'),
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
        description: 'Updated description',
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        description: 'Updated description',
      }),
    );
  });

  it('prevents updating a reversed transaction', async () => {
    prisma.transaction.findFirst.mockResolvedValue(
      createTransactionRecord({ reversedById: 'transaction-2' }),
    );

    await expect(
      service.updateTransactionForUser(authenticatedUser, 'transaction-1', {
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
    prisma.transaction.delete.mockResolvedValue({ id: 'transaction-1' });

    await expect(
      service.deleteTransactionForUser(authenticatedUser, 'transaction-1'),
    ).resolves.toBeUndefined();

    expect(prisma.transaction.delete).toHaveBeenCalledWith({
      where: {
        id: 'transaction-1',
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
});

function createTransactionRecord({
  amount = '100.50',
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
  readonly createdAt?: Date;
  readonly description?: string;
  readonly destinationAccountId?: string | null;
  readonly destinationAccountName?: string | null;
  readonly id?: string;
  readonly investmentDetail?: ReturnType<typeof createInvestmentDetailRecord> | null;
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
    description,
    merchant: null,
    notes: null,
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
  price = '67000',
  quantity = '0.015',
  tradeType = 'BUY',
}: {
  readonly assetId?: string;
  readonly assetName?: string;
  readonly assetSymbol?: string;
  readonly fees?: string;
  readonly price?: string;
  readonly quantity?: string;
  readonly tradeType?: string;
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
    fees: {
      toString: () => fees,
    },
    notes: null,
  };
}
