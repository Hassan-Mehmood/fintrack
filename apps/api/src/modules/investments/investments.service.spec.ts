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
};

describe('InvestmentsService', () => {
  let service: InvestmentsService;
  let prisma: {
    asset: {
      findMany: jest.Mock;
    };
    investmentTransactionDetail: {
      findMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
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
      createAssetRecord({ id: 'asset-1', name: 'Bitcoin', currentPrice: '70000' }),
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
        quantity: '1',
        costBasis: '60010.00',
        currentValue: '70000.00',
        unrealizedGain: '9990.00',
      }),
    );
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
      createAssetRecord({ id: 'asset-1', name: 'Bitcoin', currentPrice: '70000' }),
      createAssetRecord({ id: 'asset-2', name: 'Ethereum', currentPrice: '3500' }),
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
        baseCurrency: 'USD',
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
        priceCurrency: 'PKR',
        currentValue: '19600000.00',
        costBasis: '16800000.00',
      }),
    );
  });
});

function createAssetRecord({
  id = 'asset-1',
  name = 'Bitcoin',
  currentPrice = null,
  priceCurrency = 'USD',
}: {
  readonly id?: string;
  readonly name?: string;
  readonly currentPrice?: string | null;
  readonly priceCurrency?: string | null;
} = {}) {
  return {
    id,
    name,
    symbol: null,
    currentPrice: currentPrice ? new Decimal(currentPrice) : null,
    priceCurrency,
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
}: {
  readonly assetId?: string;
  readonly tradeType?: string;
  readonly quantity?: string;
  readonly price?: string;
  readonly fees?: string;
  readonly currency?: string;
} = {}) {
  return {
    id: `detail-${assetId}`,
    assetId,
    tradeType,
    quantity: new Decimal(quantity),
    price: new Decimal(price),
    fees: new Decimal(fees),
    transaction: { currency },
  };
}
