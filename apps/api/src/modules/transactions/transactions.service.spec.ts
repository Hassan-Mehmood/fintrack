import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { TransactionsService } from './transactions.service';
import {
  createInvalidTransferException,
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
};

const mockDate = new Date('2026-07-07T10:00:00.000Z');

describe('TransactionsService', () => {
  let service: TransactionsService;
  let prisma: {
    account: {
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
    prisma.account.findFirst.mockResolvedValue({ id: 'account-1' });
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
      .mockResolvedValueOnce({ id: 'account-1' })
      .mockResolvedValueOnce({ id: 'account-2' });
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
    prisma.account.findFirst.mockResolvedValue({ id: 'account-1' });

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

  it('updates an owned transaction', async () => {
    prisma.transaction.findFirst.mockResolvedValue(createTransactionRecord());
    prisma.account.findFirst.mockResolvedValue({ id: 'account-1' });
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
    createdAt,
    updatedAt: new Date('2026-07-02T10:00:00.000Z'),
  };
}
