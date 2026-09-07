import { Module } from '@nestjs/common';
import { PortfoliosController } from './portfolios.controller';
import { PortfoliosService } from './portfolios.service';
import { MarketDataModule } from '../market-data/market-data.module';
import { InvestmentsModule } from '../investments/investments.module';

@Module({
  imports: [MarketDataModule, InvestmentsModule],
  controllers: [PortfoliosController],
  providers: [PortfoliosService],
})
export class PortfoliosModule {}
