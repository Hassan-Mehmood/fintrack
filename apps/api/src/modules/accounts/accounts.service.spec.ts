import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AccountsService } from './accounts.service';
import { createAccountNotFoundException } from './accounts.errors';

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

describe('AccountsService', () => {
  let service: AccountsService;
  let prisma: {
    account: {
      create: jest.Mock;
      delete: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
    transaction: {
      count: jest.Mock;
      deleteMany: jest.Mock;
      findMany: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      account: {
        create: jest.fn(),
        delete: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      transaction: {
        count: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn(async (callback: unknown) => {
        if (typeof callback === 'function') {
          return callback(prisma);
        }

        const operations = callback as Array<Promise<unknown>>;
        const results: unknown[] = [];

        for (const operation of operations) {
          results.push(await operation);
        }

        return results;
      }),
    };

    service = new AccountsService(prisma as never);
  });

  it('lists user accounts with delete metadata', async () => {
    prisma.account.findMany.mockResolvedValue([
      createAccountRecord({
        transactionCount: 2,
        transferCount: 1,
      }),
    ]);

    await expect(
      service.listAccountsForUser(authenticatedUser),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'account-1',
        openingBalance: '1500.25',
        currentBalance: '1500.25',
        transactionCount: 3,
        canDelete: false,
      }),
    ]);
  });

  it('creates an account for the authenticated user', async () => {
    prisma.account.create.mockResolvedValue(createAccountRecord());

    await expect(
      service.createAccountForUser(authenticatedUser, {
        name: 'Emergency Fund',
        type: 'BANK',
        currency: 'USD',
        openingBalance: '1500.25',
        openedAt: '2026-06-01T00:00:00.000Z',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        name: 'Primary Checking',
        openingBalance: '1500.25',
        currentBalance: '1500.25',
      }),
    );

    expect(prisma.account.create).toHaveBeenCalledTimes(1);
  });

  it('throws when the requested account is not owned by the user', async () => {
    prisma.account.findFirst.mockResolvedValue(null);

    await expect(
      service.getAccountForUser(authenticatedUser, 'missing-account'),
    ).rejects.toEqual(createAccountNotFoundException('missing-account'));
  });

  it('updates an owned account', async () => {
    prisma.account.findFirst.mockResolvedValue({ id: 'account-1' });
    prisma.account.update.mockResolvedValue(
      createAccountRecord({ name: 'Updated Name' }),
    );

    await expect(
      service.updateAccountForUser(authenticatedUser, 'account-1', {
        name: 'Updated Name',
        openingBalance: '2000',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        name: 'Updated Name',
        openingBalance: '1500.25',
        currentBalance: '1500.25',
      }),
    );
  });

  it('deletes an account and all of its recorded transactions', async () => {
    prisma.account.findFirst.mockResolvedValue({ id: 'account-1' });
    prisma.transaction.findMany.mockResolvedValue([
      { id: 'transaction-1', reversalOfId: null },
      { id: 'transaction-2', reversalOfId: null },
    ]);

    await expect(
      service.deleteAccountForUser(authenticatedUser, 'account-1'),
    ).resolves.toBeUndefined();

    expect(prisma.transaction.deleteMany).toHaveBeenCalledTimes(2);
    expect(prisma.account.delete).toHaveBeenCalledWith({
      where: {
        id: 'account-1',
      },
    });
  });

  it('deletes an account that has reversal transactions', async () => {
    prisma.account.findFirst.mockResolvedValue({ id: 'account-1' });
    prisma.transaction.findMany.mockResolvedValue([
      { id: 'transaction-1', reversalOfId: null },
      { id: 'transaction-reversal', reversalOfId: 'transaction-1' },
    ]);

    await expect(
      service.deleteAccountForUser(authenticatedUser, 'account-1'),
    ).resolves.toBeUndefined();

    expect(prisma.transaction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { reversalOfId: null },
      }),
    );
    expect(prisma.transaction.deleteMany).toHaveBeenCalledTimes(2);
    expect(prisma.account.delete).toHaveBeenCalledWith({
      where: {
        id: 'account-1',
      },
    });
  });
});

function createAccountRecord({
  createdAt = new Date('2026-06-20T10:00:00.000Z'),
  name = 'Primary Checking',
  transactionCount = 0,
  transferCount = 0,
}: {
  readonly createdAt?: Date;
  readonly name?: string;
  readonly transactionCount?: number;
  readonly transferCount?: number;
} = {}) {
  return {
    id: 'account-1',
    name,
    type: 'BANK',
    currency: 'USD',
    openingBalance: {
      toString: () => '1500.25',
    },
    openedAt: new Date('2026-06-01T00:00:00.000Z'),
    archivedAt: null,
    createdAt,
    updatedAt: new Date('2026-06-21T10:00:00.000Z'),
    _count: {
      transactions: transactionCount,
      transfersIn: transferCount,
    },
  };
}
