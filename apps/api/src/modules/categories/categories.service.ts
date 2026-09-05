import { Injectable } from '@nestjs/common';
import type { TransactionType } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import type { TransactionCategories } from './categories.types';
import {
  defaultTransactionCategories,
  isDefaultTransactionCategory,
} from './default-transaction-categories';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string): Promise<TransactionCategories> {
    const history = await this.prisma.transaction.findMany({
      where: {
        userId,
        deletedAt: null,
        category: { not: '' },
      },
      distinct: ['type', 'category'],
      select: { type: true, category: true },
    });

    const result = Object.fromEntries(
      Object.entries(defaultTransactionCategories).map(([type, defaults]) => [
        type,
        [...defaults],
      ]),
    ) as Record<TransactionType, string[]>;

    for (const row of history) {
      if (!result[row.type].includes(row.category)) {
        result[row.type].push(row.category);
      }
    }

    for (const type of Object.keys(result) as TransactionType[]) {
      const defaults = defaultTransactionCategories[type];
      const historical = result[type]
        .filter((category) => !defaults.includes(category))
        .sort((left, right) => left.localeCompare(right));
      result[type] = [...defaults, ...historical];
    }

    return result;
  }

  async isAllowedForUser(
    userId: string,
    type: TransactionType,
    category: string,
  ): Promise<boolean> {
    if (isDefaultTransactionCategory(type, category)) {
      return true;
    }

    const historical = await this.prisma.transaction.findFirst({
      where: { userId, type, category, deletedAt: null },
      select: { id: true },
    });
    return historical !== null;
  }
}
