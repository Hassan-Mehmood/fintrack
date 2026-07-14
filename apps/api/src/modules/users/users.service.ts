import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';
import type { ClerkUserProfile } from '../auth/clerk-auth.service';
import type { UpdateSettingsDto } from './dto/update-settings.dto';

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
      },
    });

    return {
      ...user,
      exchangeRate: user.exchangeRate?.toFixed(8) ?? null,
    };
  }

  async getSettings(
    userId: string,
  ): Promise<{ baseCurrency: string; exchangeRate: string | null }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        baseCurrency: true,
        exchangeRate: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return {
      baseCurrency: user.baseCurrency,
      exchangeRate: user.exchangeRate?.toFixed(8) ?? null,
    };
  }

  async updateSettings(
    userId: string,
    payload: UpdateSettingsDto,
  ): Promise<{ baseCurrency: string; exchangeRate: string | null }> {
    const data: Record<string, unknown> = {};

    if (payload.baseCurrency !== undefined) {
      data.baseCurrency = payload.baseCurrency;
    }

    if (payload.exchangeRate !== undefined) {
      data.exchangeRate = payload.exchangeRate;
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        baseCurrency: true,
        exchangeRate: true,
      },
    });

    return {
      baseCurrency: user.baseCurrency,
      exchangeRate: user.exchangeRate?.toFixed(8) ?? null,
    };
  }
}
