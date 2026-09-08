import { Prisma } from '../../generated/prisma/client';
import { ConflictException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AccountsService } from './accounts.service';
import {
  createAccountNotFoundException,
  createCryptoWalletFiatNotSupportedException,
  createInvalidAccountOrderException,
} from './accounts.errors';

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
      create: jest.Mock;
      findFirst: jest.Mock;
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
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ ...data, destinationAccountId: null }),
          ),
        findFirst: jest.fn().mockResolvedValue(null),
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
    expect(prisma.account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
      }),
    );
  });

  it('creates an account for the authenticated user', async () => {
    prisma.account.findFirst.mockResolvedValue({ displayOrder: 2 });
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
    expect(prisma.account.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ displayOrder: 3 }),
      }),
    );
  });

  it('rejects a crypto wallet with a fiat opening balance', async () => {
    await expect(
      service.createAccountForUser(authenticatedUser, {
        name: 'Cold wallet',
        type: 'CRYPTO_WALLET',
        currency: 'USD',
        openingBalance: '1427.9',
      }),
    ).rejects.toEqual(createCryptoWalletFiatNotSupportedException());
    expect(prisma.account.create).not.toHaveBeenCalled();
  });

  it('persists a complete custom account order', async () => {
    prisma.account.findMany.mockResolvedValue([
      { id: 'account-1' },
      { id: 'account-2' },
      { id: 'account-3' },
    ]);

    await expect(
      service.reorderAccountsForUser(authenticatedUser, [
        'account-3',
        'account-1',
        'account-2',
      ]),
    ).resolves.toEqual(['account-3', 'account-1', 'account-2']);
    expect(prisma.account.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'account-3' },
      data: { displayOrder: 0 },
      select: { id: true },
    });
    expect(prisma.account.update).toHaveBeenNthCalledWith(3, {
      where: { id: 'account-2' },
      data: { displayOrder: 2 },
      select: { id: true },
    });
  });

  it('rejects incomplete or unowned account orders', async () => {
    prisma.account.findMany.mockResolvedValue([
      { id: 'account-1' },
      { id: 'account-2' },
    ]);

    await expect(
      service.reorderAccountsForUser(authenticatedUser, [
        'account-1',
        'unowned-account',
      ]),
    ).rejects.toEqual(createInvalidAccountOrderException());
    expect(prisma.account.update).not.toHaveBeenCalled();
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

  describe('balance adjustments', () => {
    const payload = {
      currentBalance: '1600.35',
      expectedBalance: '1500.25',
      currency: 'USD',
      idempotencyKey: 'ed32ab72-f77e-4eec-a090-db723db0b637',
    };
    beforeEach(() =>
      prisma.account.findFirst.mockResolvedValue(createAccountRecord()),
    );
    it.each([
      ['1600.35', '100.1'],
      ['1400.15', '-100.1'],
      ['0', '-1500.25'],
      ['-0.00000001', '-1500.25000001'],
    ])(
      'sets the balance to %s with a signed, categorized transaction',
      async (target, delta) => {
        const result = await service.adjustBalanceForUser(
          authenticatedUser,
          'account-1',
          { ...payload, currentBalance: target },
        );
        expect(new Prisma.Decimal(result.currentBalance).eq(target)).toBe(true);
        expect(result.openingBalance).toBe('1500.25');
        expect(result.transactionCount).toBe(1);
        expect(prisma.account.update).not.toHaveBeenCalled();
        expect(prisma.transaction.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            userId: 'user-1',
            accountId: 'account-1',
            amount: new Prisma.Decimal(delta),
            type: 'ADJUSTMENT',
            status: 'CLEARED',
            category: 'Balance adjustment',
            currency: 'USD',
          }),
        });
        expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
          isolationLevel: 'Serializable',
        });
      },
    );
    it('includes cleared source and destination effects', async () => {
      prisma.transaction.findMany.mockResolvedValue([
        {
          type: 'EXPENSE',
          accountId: 'account-1',
          destinationAccountId: null,
          amount: new Prisma.Decimal('100'),
        },
        {
          type: 'TRANSFER',
          accountId: 'other',
          destinationAccountId: 'account-1',
          amount: new Prisma.Decimal('50'),
        },
      ]);
      const result = await service.adjustBalanceForUser(
        authenticatedUser,
        'account-1',
        { ...payload, expectedBalance: '1450.25' },
      );
      expect(result.currentBalance).toBe('1600.35');
      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-1',
            status: 'CLEARED',
            deletedAt: null,
            OR: [
              { accountId: 'account-1' },
              { destinationAccountId: 'account-1' },
            ],
          },
        }),
      );
    });
    it('skips an unchanged balance', async () => {
      await service.adjustBalanceForUser(authenticatedUser, 'account-1', {
        ...payload,
        currentBalance: '1500.25',
      });
      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });
    it.each([{ expectedBalance: '1500' }, { currency: 'PKR' }])(
      'rejects stale data %j',
      async (change) => {
        await expect(
          service.adjustBalanceForUser(authenticatedUser, 'account-1', {
            ...payload,
            ...change,
          }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(prisma.transaction.create).not.toHaveBeenCalled();
      },
    );
    it('enforces ownership before reading history or writing', async () => {
      prisma.account.findFirst.mockResolvedValue(null);
      await expect(
        service.adjustBalanceForUser(authenticatedUser, 'account-1', payload),
      ).rejects.toEqual(createAccountNotFoundException('account-1'));
      expect(prisma.account.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'account-1', userId: 'user-1' },
        }),
      );
      expect(prisma.transaction.findMany).not.toHaveBeenCalled();
      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });
    it('rejects fiat balance adjustments for crypto wallets', async () => {
      prisma.account.findFirst.mockResolvedValue(
        createAccountRecord({ type: 'CRYPTO_WALLET' }),
      );
      await expect(
        service.adjustBalanceForUser(authenticatedUser, 'account-1', payload),
      ).rejects.toEqual(createCryptoWalletFiatNotSupportedException());
      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });
    it('does not duplicate retries after another balance change', async () => {
      prisma.transaction.findFirst.mockResolvedValue({
        accountId: 'account-1',
        type: 'ADJUSTMENT',
        category: 'Balance adjustment',
        description: 'Balance adjusted from 1500.25 to 1600.35 USD',
        currency: 'USD',
        amount: new Prisma.Decimal('100.1'),
      });
      await service.adjustBalanceForUser(
        authenticatedUser,
        'account-1',
        payload,
      );
      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });
    it('rejects reused keys for different requests', async () => {
      prisma.transaction.findFirst.mockResolvedValue({ accountId: 'other' });
      await expect(
        service.adjustBalanceForUser(authenticatedUser, 'account-1', payload),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });
    it('handles concurrent adjustment conflicts', async () => {
      prisma.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('conflict', {
          code: 'P2034',
          clientVersion: '7',
        }),
      );
      await expect(
        service.adjustBalanceForUser(authenticatedUser, 'account-1', payload),
      ).rejects.toBeInstanceOf(ConflictException);
    });
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
  type = 'BANK',
}: {
  readonly createdAt?: Date;
  readonly name?: string;
  readonly transactionCount?: number;
  readonly transferCount?: number;
  readonly type?: 'BANK' | 'CRYPTO_WALLET';
} = {}) {
  return {
    id: 'account-1',
    name,
    type,
    currency: 'USD',
    openingBalance: {
      toString: () => '1500.25',
    },
    displayOrder: 0,
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
