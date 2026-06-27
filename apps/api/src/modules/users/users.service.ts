import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';
import type { ClerkUserProfile } from '../auth/clerk-auth.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertFromClerkProfile(
    clerkProfile: ClerkUserProfile,
  ): Promise<AuthenticatedUser> {
    return this.prisma.user.upsert({
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
      },
    });
  }
}
