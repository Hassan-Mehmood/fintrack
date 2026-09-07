import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { Pool as PgPool } from 'pg';
import { PrismaClient } from '../src/generated/prisma/client';

config({ path: '../../.env', quiet: true });
config({ quiet: true });

function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to run the seed script.');
  }

  return databaseUrl;
}

function createAdapter(databaseUrl: string) {
  if (databaseUrl.includes('neon.tech')) {
    return new PrismaNeon({
      connectionString: databaseUrl,
    });
  }

  const pool = new PgPool({ connectionString: databaseUrl });
  return new PrismaPg(pool);
}

const prisma = new PrismaClient({ adapter: createAdapter(getDatabaseUrl()) });

const assetCategories = [
  { id: 'a0b0c0d0-e0f0-4a0b-8c0d-0e0f0a0b0c0d', name: 'Stock', order: 1 },
  { id: 'a0b0c0d0-e0f0-4a0b-8c0d-0e0f0a0b0c0e', name: 'ETF', order: 2 },
  { id: 'a0b0c0d0-e0f0-4a0b-8c0d-0e0f0a0b0c0f', name: 'Mutual Fund', order: 3 },
  { id: 'a0b0c0d0-e0f0-4a0b-8c0d-0e0f0a0b0c10', name: 'Crypto', order: 4 },
  { id: 'a0b0c0d0-e0f0-4a0b-8c0d-0e0f0a0b0c11', name: 'Bond', order: 5 },
  { id: 'a0b0c0d0-e0f0-4a0b-8c0d-0e0f0a0b0c12', name: 'Commodity', order: 6 },
  { id: 'a0b0c0d0-e0f0-4a0b-8c0d-0e0f0a0b0c13', name: 'Forex', order: 7 },
  { id: 'a0b0c0d0-e0f0-4a0b-8c0d-0e0f0a0b0c14', name: 'Gold', order: 8 },
  { id: 'a0b0c0d0-e0f0-4a0b-8c0d-0e0f0a0b0c15', name: 'Real Estate', order: 9 },
  { id: 'a0b0c0d0-e0f0-4a0b-8c0d-0e0f0a0b0c16', name: 'Cash', order: 10 },
  {
    id: 'a0b0c0d0-e0f0-4a0b-8c0d-0e0f0a0b0c17',
    name: 'Private Equity',
    order: 11,
  },
  {
    id: 'a0b0c0d0-e0f0-4a0b-8c0d-0e0f0a0b0c18',
    name: 'Cash Equivalent',
    order: 12,
  },
];

const riskProfiles = [
  {
    id: 'b0c0d0e0-f0a0-4b0c-9d0e-0f0a0b0c0d0e',
    name: 'Cash',
    score: 1,
    order: 1,
  },
  {
    id: 'b0c0d0e0-f0a0-4b0c-9d0e-0f0a0b0c0d0f',
    name: 'Savings',
    score: 2,
    order: 2,
  },
  {
    id: 'b0c0d0e0-f0a0-4b0c-9d0e-0f0a0b0c0d10',
    name: 'Bonds',
    score: 3,
    order: 3,
  },
  {
    id: 'b0c0d0e0-f0a0-4b0c-9d0e-0f0a0b0c0d11',
    name: 'Mutual Funds',
    score: 5,
    order: 4,
  },
  {
    id: 'b0c0d0e0-f0a0-4b0c-9d0e-0f0a0b0c0d12',
    name: 'Stocks',
    score: 7,
    order: 5,
  },
  {
    id: 'b0c0d0e0-f0a0-4b0c-9d0e-0f0a0b0c0d13',
    name: 'Crypto',
    score: 10,
    order: 6,
  },
  {
    id: 'b0c0d0e0-f0a0-4b0c-9d0e-0f0a0b0c0d14',
    name: 'Cash Equivalents',
    score: 1,
    order: 7,
  },
];

async function main(): Promise<void> {
  for (const category of assetCategories) {
    await prisma.assetCategory.upsert({
      where: { id: category.id },
      update: category,
      create: category,
    });
  }

  for (const profile of riskProfiles) {
    await prisma.riskProfile.upsert({
      where: { id: profile.id },
      update: profile,
      create: profile,
    });
  }

  console.log('Seeded asset categories and risk profiles.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
