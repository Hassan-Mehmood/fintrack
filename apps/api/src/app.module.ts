import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AccountsModule } from './modules/accounts/accounts.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AssetsModule } from './modules/assets/assets.module';
import { InvestmentsModule } from './modules/investments/investments.module';
import { PortfoliosModule } from './modules/portfolios/portfolios.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { AuthModule } from './modules/auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AccountsModule,
    AssetsModule,
    TransactionsModule,
    InvestmentsModule,
    AnalyticsModule,
    PortfoliosModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
