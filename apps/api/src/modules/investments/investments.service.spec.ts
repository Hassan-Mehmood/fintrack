import { Prisma } from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { InvestmentsService } from './investments.service';

const Decimal = Prisma.Decimal;

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

describe('InvestmentsService', () => {
  let service: InvestmentsService;
  let prisma: {
    account: {
      findMany: jest.Mock;
    };
    asset: {
      findMany: jest.Mock;
    };
    investmentTransactionDetail: {
      findMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      account: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      asset: {
        findMany: jest.fn(),
      },
      investmentTransactionDetail: {
        findMany: jest.fn(),
      },
    };

    service = new InvestmentsService(prisma as never);
  });

  it('returns holdings grouped by asset with calculated values', async () => {
    prisma.asset.findMany.mockResolvedValue([
      createAssetRecord({
        id: 'asset-1',
        name: 'Bitcoin',
        currentPrice: '70000',
      }),
    ]);
    prisma.investmentTransactionDetail.findMany.mockResolvedValue([
      createDetailRecord({
        assetId: 'asset-1',
        tradeType: 'BUY',
        quantity: '1',
        price: '60000',
        fees: '10',
      }),
    ]);

    const { holdings } = await service.getHoldingsForUser(authenticatedUser);

    expect(holdings).toHaveLength(1);
    expect(holdings[0]).toEqual(
      expect.objectContaining({
        assetName: 'Bitcoin',
        positionStatus: 'ACTIVE',
        liquidityClass: 'INVESTMENT',
        quantity: '1',
        costBasis: '60010.00',
        currentValue: '70000.00',
        unrealizedGain: '9990.00',
      }),
    );
    const detailQuery: unknown =
      prisma.investmentTransactionDetail.findMany.mock.lastCall?.[0];
    expect(detailQuery).toMatchObject({
      where: {
        transaction: {
          reversalOfId: null,
          reversal: { is: null },
        },
      },
    });
  });

  it('excludes assets without investment transactions', async () => {
    prisma.asset.findMany.mockResolvedValue([
      createAssetRecord({ id: 'asset-1', name: 'Bitcoin' }),
      createAssetRecord({ id: 'asset-2', name: 'Ethereum' }),
    ]);
    prisma.investmentTransactionDetail.findMany.mockResolvedValue([
      createDetailRecord({ assetId: 'asset-1', tradeType: 'BUY' }),
    ]);

    const { holdings } = await service.getHoldingsForUser(authenticatedUser);

    expect(holdings).toHaveLength(1);
    expect(holdings[0]?.assetName).toBe('Bitcoin');
  });

  it('returns summary totals across all holdings', async () => {
    prisma.asset.findMany.mockResolvedValue([
      createAssetRecord({
        id: 'asset-1',
        name: 'Bitcoin',
        currentPrice: '70000',
      }),
      createAssetRecord({
        id: 'asset-2',
        name: 'Ethereum',
        currentPrice: '3500',
      }),
    ]);
    prisma.investmentTransactionDetail.findMany.mockResolvedValue([
      createDetailRecord({
        assetId: 'asset-1',
        tradeType: 'BUY',
        quantity: '1',
        price: '60000',
        fees: '0',
      }),
      createDetailRecord({
        assetId: 'asset-2',
        tradeType: 'BUY',
        quantity: '2',
        price: '3000',
        fees: '0',
      }),
    ]);

    const summary = await service.getSummaryForUser(authenticatedUser);

    expect(summary.data).toEqual(
      expect.objectContaining({
        totalCostBasis: '66000.00',
        totalCurrentValue: '77000.00',
        totalUnrealizedGain: '11000.00',
        reportingCurrency: 'USD',
      }),
    );
  });

  it('adds derived fiat cash to account value and liquidity without changing P&L', async () => {
    prisma.asset.findMany.mockResolvedValue([]);
    prisma.investmentTransactionDetail.findMany.mockResolvedValue([]);
    prisma.account.findMany.mockResolvedValue([
      {
        id: 'broker-1',
        name: 'Brokerage',
        currency: 'USD',
        openingBalance: new Decimal(1000),
        transactions: [],
        transfersIn: [],
        portfolioCashAllocations: [],
      },
    ]);

    const summary = await service.getSummaryForUser(authenticatedUser);
    const { holdings } = await service.getHoldingsForUser(authenticatedUser);

    expect(holdings).toEqual([
      expect.objectContaining({
        holdingKind: 'FIAT_CASH',
        accountId: 'broker-1',
        quantity: '1000',
        currentValue: '1000.00',
        costBasis: null,
      }),
    ]);
    expect(summary.data).toEqual(
      expect.objectContaining({
        totalCurrentValue: '0.00',
        totalAccountValue: '1000.00',
        fiatCashValue: '1000.00',
        totalLiquidity: '1000.00',
        totalUnrealizedGain: '0.00',
      }),
    );
  });

  it('uses portfolio cash percentages without double counting grouped cash', async () => {
    prisma.asset.findMany.mockResolvedValue([]);
    prisma.investmentTransactionDetail.findMany.mockResolvedValue([]);
    prisma.account.findMany.mockResolvedValue([
      {
        id: 'broker-1',
        name: 'Brokerage',
        currency: 'USD',
        openingBalance: new Decimal(1000),
        transactions: [],
        transfersIn: [],
        portfolioCashAllocations: [
          {
            percentage: new Decimal(25),
            portfolio: { id: 'portfolio-1', name: 'Core' },
          },
        ],
      },
    ]);

    const { holdings } = await service.getHoldingsForUser(authenticatedUser, {
      groupBy: 'PORTFOLIO',
    });

    expect(holdings).toEqual([
      expect.objectContaining({ currentValue: '250.00' }),
      expect.objectContaining({ currentValue: '750.00', portfolios: [] }),
    ]);
  });

  it('derives both sides of a crypto purchase settled with a stablecoin', async () => {
    prisma.asset.findMany.mockResolvedValue([
      createAssetRecord({ id: 'btc', name: 'Bitcoin', currentPrice: '60000' }),
      createAssetRecord({
        id: 'usdt',
        name: 'Tether',
        currentPrice: '1',
        liquidityClass: 'CASH_EQUIVALENT',
      }),
    ]);
    prisma.investmentTransactionDetail.findMany.mockResolvedValue([
      createDetailRecord({
        assetId: 'usdt',
        tradeType: 'OPENING',
        quantity: '2000',
        price: '1',
        grossAmount: '2000',
      }),
      createDetailRecord({
        assetId: 'btc',
        settlementAssetId: 'usdt',
        quantity: '0.02',
        price: '50000',
        fees: '2',
        grossAmount: '1000',
      }),
    ]);

    const { holdings } = await service.getHoldingsForUser(authenticatedUser);

    expect(holdings.find((holding) => holding.assetId === 'btc')).toEqual(
      expect.objectContaining({ quantity: '0.02', costBasis: '1002.00' }),
    );
    expect(holdings.find((holding) => holding.assetId === 'usdt')).toEqual(
      expect.objectContaining({
        quantity: '998',
        liquidityClass: 'CASH_EQUIVALENT',
      }),
    );
  });

  it('converts holding values to the user base currency when exchange rate is set', async () => {
    prisma.asset.findMany.mockResolvedValue([
      createAssetRecord({
        id: 'asset-1',
        name: 'Bitcoin',
        currentPrice: '70000',
        priceCurrency: 'USD',
      }),
    ]);
    prisma.investmentTransactionDetail.findMany.mockResolvedValue([
      createDetailRecord({
        assetId: 'asset-1',
        tradeType: 'BUY',
        quantity: '1',
        price: '60000',
        fees: '0',
        currency: 'USD',
        fxRateUsdToPkr: '280',
      }),
    ]);

    const userWithRate: AuthenticatedUser = {
      ...authenticatedUser,
      baseCurrency: 'PKR',
      exchangeRate: '280',
    };

    const { holdings } = await service.getHoldingsForUser(userWithRate);

    expect(holdings[0]).toEqual(
      expect.objectContaining({
        reportingCurrency: 'PKR',
        currentValue: '19600000.00',
        costBasis: '16800000.00',
      }),
    );
  });

  it('uses historical FX for cost basis and the latest FX for market value', async () => {
    prisma.asset.findMany.mockResolvedValue([
      createAssetRecord({
        currentPrice: '1200',
        priceCurrency: 'USD',
      }),
    ]);
    prisma.investmentTransactionDetail.findMany.mockResolvedValue([
      createDetailRecord({
        price: '1000',
        fxRateUsdToPkr: '250',
      }),
    ]);
    const userWithLatestRate: AuthenticatedUser = {
      ...authenticatedUser,
      baseCurrency: 'PKR',
      exchangeRate: '280',
    };

    const { holdings } = await service.getHoldingsForUser(userWithLatestRate);

    expect(holdings[0]).toEqual(
      expect.objectContaining({
        accountId: 'account-1',
        nativeCurrency: 'USD',
        nativeCostBasis: '1000.00',
        costBasis: '250000.00',
        currentValue: '336000.00',
        unrealizedGain: '86000.00',
      }),
    );
  });

  it('returns currency-grouped totals without a combined total in native mode', async () => {
    prisma.asset.findMany.mockResolvedValue([
      createAssetRecord({
        id: 'asset-usd',
        currentPrice: '120',
        priceCurrency: 'USD',
      }),
      createAssetRecord({
        id: 'asset-pkr',
        currentPrice: '1200',
        priceCurrency: 'PKR',
      }),
    ]);
    prisma.investmentTransactionDetail.findMany.mockResolvedValue([
      createDetailRecord({
        assetId: 'asset-usd',
        price: '100',
        currency: 'USD',
      }),
      createDetailRecord({
        assetId: 'asset-pkr',
        price: '1000',
        currency: 'PKR',
      }),
    ]);

    const summary = await service.getSummaryForUser(authenticatedUser, {
      reportingCurrency: 'NATIVE',
    });

    expect(summary.data).toEqual(
      expect.objectContaining({
        reportingCurrency: 'NATIVE',
        totalCostBasis: null,
        totalCurrentValue: null,
        totalsByCurrency: [
          expect.objectContaining({
            currency: 'PKR',
            totalCurrentValue: '1200.00',
          }),
          expect.objectContaining({
            currency: 'USD',
            totalCurrentValue: '120.00',
          }),
        ],
      }),
    );
  });

  it('creates an atomic opening position with zero cash impact', async () => {
    const tx = {
      transaction: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'transaction-1' }),
      },
      asset: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'asset-1',
          name: 'Apple',
          symbol: 'AAPL',
          priceCurrency: 'USD',
          marketType: 'STOCK',
        }),
      },
      account: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'account-1',
          currency: 'USD',
          type: 'BROKER',
        }),
      },
    };
    const positionPrisma = {
      $transaction: jest.fn(
        async (operation: (client: typeof tx) => Promise<unknown>) =>
          operation(tx),
      ),
    };
    const positionService = new InvestmentsService(positionPrisma as never);
    jest.spyOn(positionService, 'getHoldingsForUser').mockResolvedValue({
      holdings: [{ assetId: 'asset-1' } as never],
      baseCurrency: 'USD',
      reportingCurrency: 'USD',
    });

    await positionService.createPositionForUser(authenticatedUser, {
      idempotencyKey: '00000000-0000-4000-8000-000000000001',
      mode: 'OPENING',
      asset: {
        kind: 'EXISTING',
        assetId: '00000000-0000-4000-8000-000000000002',
      },
      account: {
        kind: 'EXISTING',
        accountId: '00000000-0000-4000-8000-000000000003',
      },
      quantity: '100',
      costInput: 'TOTAL',
      totalCost: '1200',
      occurredAt: '2026-01-01T00:00:00.000Z',
    });

    expect(tx.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: new Decimal(0),
          type: 'INVESTMENT_OPENING_POSITION',
          investmentDetail: {
            create: expect.objectContaining({
              tradeType: 'OPENING',
              quantity: new Decimal(100),
              price: new Decimal(12),
              grossAmount: new Decimal(1200),
              fees: new Decimal(0),
            }),
          },
        }),
      }),
    );
  });
});

function createAssetRecord({
  id = 'asset-1',
  name = 'Bitcoin',
  currentPrice = null,
  priceCurrency = 'USD',
  liquidityClass = 'INVESTMENT',
}: {
  readonly id?: string;
  readonly name?: string;
  readonly currentPrice?: string | null;
  readonly priceCurrency?: string | null;
  readonly liquidityClass?: 'INVESTMENT' | 'CASH_EQUIVALENT';
} = {}) {
  return {
    id,
    name,
    symbol: null,
    currentPrice: currentPrice ? new Decimal(currentPrice) : null,
    priceCurrency,
    provider: null,
    providerAssetId: null,
    liquidityClass,
    liquidityClassSource: 'AUTO',
    category: { name: 'Crypto' },
    riskProfile: { name: 'Aggressive' },
  };
}

function createDetailRecord({
  assetId = 'asset-1',
  tradeType = 'BUY',
  quantity = '1',
  price = '60000',
  fees = '0',
  currency = 'USD',
  fxRateUsdToPkr = null,
  settlementAssetId = null,
  grossAmount,
}: {
  readonly assetId?: string;
  readonly tradeType?: string;
  readonly quantity?: string;
  readonly price?: string;
  readonly fees?: string;
  readonly currency?: string;
  readonly fxRateUsdToPkr?: string | null;
  readonly settlementAssetId?: string | null;
  readonly grossAmount?: string;
} = {}) {
  return {
    id: `detail-${assetId}`,
    assetId,
    settlementAssetId,
    tradeType,
    quantity: new Decimal(quantity),
    price: new Decimal(price),
    priceCurrency: currency,
    fees: new Decimal(fees),
    grossAmount: new Decimal(grossAmount ?? new Decimal(quantity).times(price)),
    fxRateUsdToPkr: fxRateUsdToPkr ? new Decimal(fxRateUsdToPkr) : null,
    transaction: {
      currency,
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
      account: {
        id: 'account-1',
        name: 'Brokerage',
        currency,
        portfolioHoldings: [],
      },
      destinationAccount: null,
    },
  };
}
