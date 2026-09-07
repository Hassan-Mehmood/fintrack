import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { Pool as PgPool } from 'pg';
import {
  calculateHolding,
  type InvestmentTransactionInput,
} from '../src/common/financial/holdings';
import { PrismaClient } from '../src/generated/prisma/client';

config({ path: '../../.env', quiet: true });
config({ quiet: true });

function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to run the portfolio backfill.');
  }
  return databaseUrl;
}

function createAdapter(databaseUrl: string) {
  if (databaseUrl.includes('neon.tech')) {
    return new PrismaNeon({ connectionString: databaseUrl });
  }
  return new PrismaPg(new PgPool({ connectionString: databaseUrl }));
}

const prisma = new PrismaClient({ adapter: createAdapter(getDatabaseUrl()) });

async function main(): Promise<void> {
  const legacyMemberships = await prisma.portfolioAccount.findMany({
    orderBy: [{ portfolio: { createdAt: 'asc' } }, { portfolioId: 'asc' }],
    select: { portfolioId: true, accountId: true },
  });
  if (legacyMemberships.length === 0) {
    console.log('No legacy portfolio memberships need backfilling.');
    return;
  }

  const accountIds = [
    ...new Set(legacyMemberships.map(({ accountId }) => accountId)),
  ];
  const [details, existingMemberships] = await Promise.all([
    prisma.investmentTransactionDetail.findMany({
      where: {
        transaction: {
          accountId: { in: accountIds },
          status: 'CLEARED',
          deletedAt: null,
          reversalOfId: null,
          reversal: { is: null },
        },
      },
      orderBy: [{ transaction: { occurredAt: 'asc' } }, { createdAt: 'asc' }],
      select: {
        assetId: true,
        tradeType: true,
        quantity: true,
        price: true,
        fees: true,
        transaction: { select: { accountId: true } },
      },
    }),
    prisma.portfolioHolding.findMany({
      select: { accountId: true, assetId: true },
    }),
  ]);

  const detailsByPosition = new Map<string, typeof details>();
  for (const detail of details) {
    const key = `${detail.transaction.accountId}:${detail.assetId}`;
    const current = detailsByPosition.get(key) ?? [];
    current.push(detail);
    detailsByPosition.set(key, current);
  }

  const claimedPositions = new Set(
    existingMemberships.map(
      ({ accountId, assetId }) => `${accountId}:${assetId}`,
    ),
  );
  const rows: Array<{
    portfolioId: string;
    accountId: string;
    assetId: string;
  }> = [];

  for (const membership of legacyMemberships) {
    for (const [positionKey, positionDetails] of detailsByPosition) {
      if (!positionKey.startsWith(`${membership.accountId}:`)) continue;
      if (claimedPositions.has(positionKey)) continue;

      const holding = calculateHolding({
        currentPrice: null,
        priceCurrency: null,
        transactions: positionDetails.map((detail) => ({
          type: detail.tradeType as InvestmentTransactionInput['type'],
          quantity: detail.quantity,
          price: detail.price,
          fees: detail.fees,
        })),
      });
      if (holding.quantity.isZero()) continue;

      rows.push({
        portfolioId: membership.portfolioId,
        accountId: membership.accountId,
        assetId: positionDetails[0].assetId,
      });
      claimedPositions.add(positionKey);
    }
  }

  if (rows.length > 0) {
    await prisma.portfolioHolding.createMany({
      data: rows,
      skipDuplicates: true,
    });
  }
  console.log(`Backfilled ${rows.length} active portfolio position(s).`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
