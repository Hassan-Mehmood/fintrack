import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';
import type { ClerkUserProfile } from '../auth/clerk-auth.service';
import type { UpdateSettingsDto } from './dto/update-settings.dto';

export interface CurrencySettings {
  readonly baseCurrency: string;
  readonly exchangeRate: string | null;
  readonly exchangeRateSource: string;
  readonly exchangeRateUpdatedAt: string | null;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertFromClerkProfile(
    clerkProfile: ClerkUserProfile,
  ): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.upsert({
      where: {
        clerkId: clerkProfile.clerkId,
      },
      update: {
        email: clerkProfile.email,
        name: clerkProfile.name,
      },
      create: {
        clerkId: clerkProfile.clerkId,
        email: clerkProfile.email,
        name: clerkProfile.name,
      },
      select: {
        id: true,
        clerkId: true,
        email: true,
        name: true,
        baseCurrency: true,
        exchangeRate: true,
        exchangeRateSource: true,
        exchangeRateUpdatedAt: true,
      },
    });

    return {
      ...user,
      exchangeRate: user.exchangeRate?.toFixed(8) ?? null,
      exchangeRateUpdatedAt: user.exchangeRateUpdatedAt?.toISOString() ?? null,
    };
  }

  async getSettings(userId: string): Promise<CurrencySettings> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        baseCurrency: true,
        exchangeRate: true,
        exchangeRateSource: true,
        exchangeRateUpdatedAt: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return {
      baseCurrency: user.baseCurrency,
      exchangeRate: user.exchangeRate?.toFixed(8) ?? null,
      exchangeRateSource: user.exchangeRateSource,
      exchangeRateUpdatedAt: user.exchangeRateUpdatedAt?.toISOString() ?? null,
    };
  }

  async updateSettings(
    userId: string,
    payload: UpdateSettingsDto,
  ): Promise<CurrencySettings> {
    const data: Prisma.UserUpdateInput = {};

    if (payload.baseCurrency !== undefined) {
      data.baseCurrency = payload.baseCurrency;
    }

    if (payload.exchangeRate !== undefined) {
      data.exchangeRate = payload.exchangeRate;
      data.exchangeRateSource = 'MANUAL_SETTINGS';
      data.exchangeRateUpdatedAt = new Date();
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        baseCurrency: true,
        exchangeRate: true,
        exchangeRateSource: true,
        exchangeRateUpdatedAt: true,
      },
    });

    return {
      baseCurrency: user.baseCurrency,
      exchangeRate: user.exchangeRate?.toFixed(8) ?? null,
      exchangeRateSource: user.exchangeRateSource,
      exchangeRateUpdatedAt: user.exchangeRateUpdatedAt?.toISOString() ?? null,
    };
  }
}
