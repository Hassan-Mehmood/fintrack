import { Module } from '@nestjs/common';
import { CoinGeckoProvider } from './coingecko.provider';
import { FinnhubProvider } from './finnhub.provider';
import { MarketDataController } from './market-data.controller';
import { MarketDataService } from './market-data.service';
import { ProviderHttpService } from './provider-http.service';
import { RedisCacheService } from './redis-cache.service';

@Module({
  controllers: [MarketDataController],
  providers: [
    RedisCacheService,
    ProviderHttpService,
    FinnhubProvider,
    CoinGeckoProvider,
    MarketDataService,
  ],
  exports: [MarketDataService],
})
export class MarketDataModule {}
