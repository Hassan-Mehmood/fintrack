import { Prisma } from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PortfoliosService } from './portfolios.service';
import {
  createAccountNotFoundForPortfolioException,
  createCryptoPortfolioCashNotSupportedException,
  createPortfolioNotFoundException,
} from './portfolios.errors';

jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const Decimal = Prisma.Decimal;

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

describe('PortfoliosService', () => {
  let service: PortfoliosService;
  let prisma: {
    portfolio: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    account: {
      findMany: jest.Mock;
    };
    transaction: {
      findMany: jest.Mock;
    };
    investmentTransactionDetail: {
      findMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      portfolio: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      account: {
        findMany: jest.fn(),
      },
      transaction: {
        findMany: jest.fn(),
      },
      investmentTransactionDetail: {
        findMany: jest.fn(),
      },
    };

    service = new PortfoliosService(prisma as never);
  });

  it('lists user portfolios with account counts', async () => {
    prisma.portfolio.findMany.mockResolvedValue([
      createPortfolioRecord({
        id: 'portfolio-1',
        name: 'Retirement',
        accounts: [],
      }),
      createPortfolioRecord({
        id: 'portfolio-2',
        name: 'Crypto',
        accounts: [],
      }),
    ]);
    prisma.account.findMany.mockResolvedValue([]);
    prisma.transaction.findMany.mockResolvedValue([]);
    prisma.investmentTransactionDetail.findMany.mockResolvedValue([]);

    const portfolios = await service.listPortfoliosForUser(authenticatedUser);

    expect(portfolios).toHaveLength(2);
    expect(portfolios[0]).toEqual(
      expect.objectContaining({
        id: 'portfolio-1',
        name: 'Retirement',
        accountCount: 0,
      }),
    );
  });

  it('creates a portfolio with selected accounts', async () => {
    prisma.account.findMany.mockResolvedValue([{ id: 'account-1' }]);
    prisma.portfolio.create.mockResolvedValue(
      createPortfolioRecord({
        id: 'portfolio-1',
        name: 'Retirement',
        accounts: [{ accountId: 'account-1' }],
      }),
    );
    prisma.account.findMany.mockResolvedValue([
      createAccountRecord({ id: 'account-1', openingBalance: '1000' }),
    ]);
    prisma.transaction.findMany.mockResolvedValue([]);
    prisma.investmentTransactionDetail.findMany.mockResolvedValue([]);

    const portfolio = await service.createPortfolioForUser(authenticatedUser, {
      name: 'Retirement',
      accountIds: ['account-1'],
    });

    expect(portfolio.name).toBe('Retirement');
    expect(portfolio.accountCount).toBe(1);
    expect(portfolio.metrics.totalValue).toBe('1000.00');
  });

  it('rejects a portfolio with an account not owned by the user', async () => {
    prisma.account.findMany.mockResolvedValue([]);

    await expect(
      service.createPortfolioForUser(authenticatedUser, {
        name: 'Invalid',
        accountIds: ['account-1'],
      }),
    ).rejects.toEqual(createAccountNotFoundForPortfolioException('account-1'));
  });

  it('rejects fiat cash allocations for crypto portfolios', async () => {
    await expect(
      service.createPortfolioForUser(authenticatedUser, {
        domain: 'CRYPTO',
        name: 'Crypto',
        cashAllocations: [{ accountId: 'account-1', percentage: '100' }],
      }),
    ).rejects.toEqual(createCryptoPortfolioCashNotSupportedException());
  });

  it('gets a portfolio with metrics and allocation', async () => {
    prisma.portfolio.findFirst.mockResolvedValue(
      createPortfolioRecord({
        id: 'portfolio-1',
        name: 'Crypto',
        accounts: [{ accountId: 'account-1' }],
      }),
    );
    prisma.account.findMany.mockResolvedValue([
      createAccountRecord({ id: 'account-1', openingBalance: '1005' }),
    ]);
    prisma.transaction.findMany.mockResolvedValue([
      createTransactionRecord({
        accountId: 'account-1',
        type: 'INVESTMENT_BUY',
        amount: '1005',
      }),
    ]);
    prisma.investmentTransactionDetail.findMany.mockResolvedValue([
      createInvestmentDetailRecord({
        assetId: 'asset-1',
        tradeType: 'BUY',
        quantity: '1',
        price: '1000',
        fees: '5',
        assetCurrentPrice: '1200',
        categoryName: 'Crypto',
        riskScore: 10,
      }),
    ]);

    const portfolio = await service.getPortfolioForUser(
      authenticatedUser,
      'portfolio-1',
    );

    expect(portfolio.name).toBe('Crypto');
    expect(portfolio.metrics.totalValue).toBe('1200.00');
    expect(portfolio.metrics.totalCostBasis).toBe('1005.00');
    expect(portfolio.metrics.totalUnrealizedGain).toBe('195.00');
    expect(portfolio.metrics.weightedRiskScore).toBe(10);
    expect(portfolio.allocation).toEqual([{ category: 'Crypto', value: 100 }]);
  });

  it('throws when requesting a portfolio not owned by the user', async () => {
    prisma.portfolio.findFirst.mockResolvedValue(null);

    await expect(
      service.getPortfolioForUser(authenticatedUser, 'missing-portfolio'),
    ).rejects.toEqual(createPortfolioNotFoundException('missing-portfolio'));
  });

  it('updates a portfolio name and account selection', async () => {
    prisma.portfolio.findFirst.mockResolvedValue(
      createPortfolioRecord({
        id: 'portfolio-1',
        name: 'Old name',
        accounts: [{ accountId: 'account-1' }],
      }),
    );
    prisma.account.findMany.mockResolvedValue([{ id: 'account-2' }]);
    prisma.portfolio.update.mockResolvedValue(
      createPortfolioRecord({
        id: 'portfolio-1',
        name: 'New name',
        accounts: [{ accountId: 'account-2' }],
      }),
    );
    prisma.account.findMany.mockResolvedValue([
      createAccountRecord({ id: 'account-2', openingBalance: '500' }),
    ]);
    prisma.transaction.findMany.mockResolvedValue([]);
    prisma.investmentTransactionDetail.findMany.mockResolvedValue([]);

    const portfolio = await service.updatePortfolioForUser(
      authenticatedUser,
      'portfolio-1',
      {
        name: 'New name',
        accountIds: ['account-2'],
      },
    );

    expect(portfolio.name).toBe('New name');
    expect(portfolio.accountCount).toBe(1);
    expect(portfolio.metrics.totalValue).toBe('500.00');
  });

  it('deletes a portfolio without deleting its accounts', async () => {
    prisma.portfolio.findFirst.mockResolvedValue(
      createPortfolioRecord({ id: 'portfolio-1' }),
    );

    await expect(
      service.deletePortfolioForUser(authenticatedUser, 'portfolio-1'),
    ).resolves.toBeUndefined();

    expect(prisma.portfolio.delete).toHaveBeenCalledWith({
      where: { id: 'portfolio-1' },
    });
  });
});

function createPortfolioRecord({
  id = 'portfolio-1',
  name = 'Test Portfolio',
  description = null,
  accounts = [],
  createdAt = new Date('2026-07-01T10:00:00.000Z'),
  updatedAt = new Date('2026-07-02T10:00:00.000Z'),
}: {
  readonly id?: string;
  readonly name?: string;
  readonly description?: string | null;
  readonly accounts?: ReadonlyArray<{ readonly accountId: string }>;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
} = {}) {
  return {
    id,
    name,
    description,
    accounts,
    createdAt,
    updatedAt,
  };
}

function createAccountRecord({
  id = 'account-1',
  name = 'Broker',
  type = 'BROKER',
  currency = 'USD',
  openingBalance = '0',
}: {
  readonly id?: string;
  readonly name?: string;
  readonly type?: string;
  readonly currency?: string;
  readonly openingBalance?: string;
} = {}) {
  return {
    id,
    name,
    type,
    currency,
    openingBalance: new Decimal(openingBalance),
  };
}

function createTransactionRecord({
  id = 'transaction-1',
  accountId = 'account-1',
  destinationAccountId = null,
  type = 'EXPENSE',
  amount = '100',
}: {
  readonly id?: string;
  readonly accountId?: string;
  readonly destinationAccountId?: string | null;
  readonly type?: string;
  readonly amount?: string;
} = {}) {
  return {
    id,
    type,
    accountId,
    destinationAccountId,
    amount: new Decimal(amount),
  };
}

function createInvestmentDetailRecord({
  assetId = 'asset-1',
  assetName = 'Bitcoin',
  assetSymbol = 'BTC',
  tradeType = 'BUY',
  quantity = '1',
  price = '1000',
  fees = '0',
  assetCurrentPrice = '1000',
  priceCurrency = 'USD',
  categoryName = 'Crypto',
  riskScore = 10,
}: {
  readonly assetId?: string;
  readonly assetName?: string;
  readonly assetSymbol?: string | null;
  readonly tradeType?: string;
  readonly quantity?: string;
  readonly price?: string;
  readonly fees?: string;
  readonly assetCurrentPrice?: string;
  readonly priceCurrency?: string;
  readonly categoryName?: string;
  readonly riskScore?: number;
} = {}) {
  return {
    assetId,
    tradeType,
    quantity: new Decimal(quantity),
    price: new Decimal(price),
    fees: new Decimal(fees),
    asset: {
      name: assetName,
      symbol: assetSymbol,
      currentPrice: new Decimal(assetCurrentPrice),
      priceCurrency,
      category: { name: categoryName },
      riskProfile: { name: 'Aggressive', score: riskScore },
    },
    transaction: { currency: 'USD', occurredAt: new Date() },
  };
}
