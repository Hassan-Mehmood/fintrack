import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_ROUTE_KEY } from '../../common/decorators/public-route.decorator';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request';
import { UsersService } from '../users/users.service';
import { ClerkAuthService, type ClerkUserProfile } from './clerk-auth.service';

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly clerkAuthService: ClerkAuthService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublicRoute = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_ROUTE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isPublicRoute) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.getBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    let clerkProfile: ClerkUserProfile;

    try {
      const clerkId = await this.clerkAuthService.verifySessionToken(token);
      clerkProfile = await this.clerkAuthService.getUserProfile(clerkId);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new UnauthorizedException('Invalid Clerk session token.');
    }

    request.authenticatedUser =
      await this.usersService.upsertFromClerkProfile(clerkProfile);

    return true;
  }

  private getBearerToken(request: AuthenticatedRequest): string | null {
    const authorizationHeader = request.headers.authorization;

    if (!authorizationHeader) {
      return null;
    }

    const [scheme, token] = authorizationHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return null;
    }

    return token;
  }
}
