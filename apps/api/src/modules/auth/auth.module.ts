import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { UsersModule } from '../users/users.module';
import { ClerkAuthGuard } from './clerk-auth.guard';
import { ClerkAuthService } from './clerk-auth.service';

@Module({
  imports: [UsersModule],
  providers: [
    ClerkAuthService,
    {
      provide: APP_GUARD,
      useClass: ClerkAuthGuard,
    },
  ],
})
export class AuthModule {}
