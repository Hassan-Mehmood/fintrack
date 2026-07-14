import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { Pool as PgPool } from 'pg';
import { PrismaClient } from '../generated/prisma/client';

config({ path: '../../.env', quiet: true });
config({ quiet: true });

function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to initialize Prisma.');
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

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const databaseUrl = getDatabaseUrl();
    const adapter = createAdapter(databaseUrl);

    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
