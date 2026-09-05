import { CategoriesService } from './categories.service';

jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: {
    transaction: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      transaction: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    };
    service = new CategoriesService(prisma as never);
  });

  it('places defaults before alphabetized historical categories by type', async () => {
    prisma.transaction.findMany.mockResolvedValue([
      { type: 'EXPENSE', category: 'Work meals' },
      { type: 'EXPENSE', category: 'Childcare' },
      { type: 'INCOME', category: 'Consulting' },
      { type: 'EXPENSE', category: 'Housing' },
    ]);

    const result = await service.listForUser('user-1');

    expect(result.EXPENSE.slice(0, 3)).toEqual([
      'Housing',
      'Groceries',
      'Food & dining',
    ]);
    expect(result.EXPENSE.slice(-2)).toEqual(['Childcare', 'Work meals']);
    expect(result.INCOME.slice(-1)).toEqual(['Consulting']);
    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-1',
          deletedAt: null,
          category: { not: '' },
        },
      }),
    );
  });

  it('accepts defaults without querying history', async () => {
    await expect(
      service.isAllowedForUser('user-1', 'EXPENSE', 'Groceries'),
    ).resolves.toBe(true);
    expect(prisma.transaction.findFirst).not.toHaveBeenCalled();
  });

  it('only accepts historical categories owned by the user for that type', async () => {
    prisma.transaction.findFirst.mockResolvedValue({ id: 'transaction-1' });

    await expect(
      service.isAllowedForUser('user-1', 'EXPENSE', 'Childcare'),
    ).resolves.toBe(true);
    expect(prisma.transaction.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        type: 'EXPENSE',
        category: 'Childcare',
        deletedAt: null,
      },
      select: { id: true },
    });
  });
});
