import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { createClient, type RedisClientType } from 'redis';

@Injectable()
export class RedisCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  private readonly memory = new Map<
    string,
    { value: string; expiresAt: number }
  >();
  private client: RedisClientType | null = null;

  async onModuleInit(): Promise<void> {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      this.logger.warn(
        'REDIS_URL is not configured; market-data caching is using an in-memory fallback.',
      );
      return;
    }

    const client = createClient({ url: redisUrl });
    client.on('error', (error: Error) => {
      this.logger.error(`Redis connection error: ${error.message}`);
    });
    await client.connect();
    this.client = client;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client?.isOpen) {
      await this.client.quit();
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = this.client
      ? await this.client.get(key)
      : this.getMemoryValue(key);

    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as T;
    } catch {
      await this.delete(key);
      return null;
    }
  }

  async setJson(
    key: string,
    value: unknown,
    ttlSeconds: number,
  ): Promise<void> {
    const raw = JSON.stringify(value);

    if (this.client) {
      await this.client.set(key, raw, { EX: ttlSeconds });
      return;
    }

    this.memory.set(key, {
      value: raw,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async incrementWithExpiry(key: string, ttlSeconds: number): Promise<number> {
    if (this.client) {
      const count = await this.client.incr(key);
      if (count === 1) {
        await this.client.expire(key, ttlSeconds);
      }
      return count;
    }

    const current = Number(this.getMemoryValue(key) ?? '0') + 1;
    this.memory.set(key, {
      value: String(current),
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
    return current;
  }

  private getMemoryValue(key: string): string | null {
    const entry = this.memory.get(key);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt <= Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return entry.value;
  }

  private async delete(key: string): Promise<void> {
    if (this.client) {
      await this.client.del(key);
      return;
    }
    this.memory.delete(key);
  }
}
