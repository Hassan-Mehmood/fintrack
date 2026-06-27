import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createClerkClient, verifyToken, type User } from '@clerk/backend';

export interface ClerkUserProfile {
  readonly clerkId: string;
  readonly email: string;
  readonly name: string | null;
}

@Injectable()
export class ClerkAuthService {
  private clerkClient: ReturnType<typeof createClerkClient> | null = null;

  async verifySessionToken(token: string): Promise<string> {
    const verifiedToken = await verifyToken(token, {
      secretKey: this.getSecretKey(),
      jwtKey: process.env.CLERK_JWT_KEY,
    });

    if (!verifiedToken.sub) {
      throw new Error('Verified Clerk token did not include a subject.');
    }

    return verifiedToken.sub;
  }

  async getUserProfile(clerkId: string): Promise<ClerkUserProfile> {
    const clerkUser = await this.getClerkClient().users.getUser(clerkId);
    const email = this.getPrimaryEmail(clerkUser);

    if (!email) {
      throw new Error(`Clerk user ${clerkId} does not have an email address.`);
    }

    return {
      clerkId,
      email,
      name: this.getDisplayName(clerkUser),
    };
  }

  private getClerkClient(): ReturnType<typeof createClerkClient> {
    this.clerkClient ??= createClerkClient({
      secretKey: this.getSecretKey(),
    });

    return this.clerkClient;
  }

  private getSecretKey(): string {
    const secretKey = process.env.CLERK_SECRET_KEY;

    if (!secretKey) {
      throw new InternalServerErrorException(
        'CLERK_SECRET_KEY is required for authenticated API requests.',
      );
    }

    return secretKey;
  }

  private getPrimaryEmail(clerkUser: User): string | null {
    return (
      clerkUser.primaryEmailAddress?.emailAddress ??
      clerkUser.emailAddresses[0]?.emailAddress ??
      null
    );
  }

  private getDisplayName(clerkUser: User): string | null {
    if (clerkUser.fullName) {
      return clerkUser.fullName;
    }

    const name = [clerkUser.firstName, clerkUser.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    return name || null;
  }
}
