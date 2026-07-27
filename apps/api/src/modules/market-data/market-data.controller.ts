import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { GetMarketPricesDto } from './dto/get-market-prices.dto';
import { SearchMarketDataDto } from './dto/search-market-data.dto';
import { MarketDataService } from './market-data.service';

@Controller('api/v1/market-data')
export class MarketDataController {
  constructor(private readonly marketDataService: MarketDataService) {}

  @Get('search')
  async search(@Query() query: SearchMarketDataDto) {
    const results = await this.marketDataService.search(
      query.type,
      query.query,
    );
    return { data: results, meta: { total: results.length } };
  }

  @Post('prices')
  async prices(
    @CurrentUser() user: AuthenticatedUser,
    @Body() payload: GetMarketPricesDto,
  ) {
    const prices = await this.marketDataService.getPricesForUser(
      user,
      payload.assetIds,
    );
    return { data: prices, meta: { total: prices.length } };
  }
}
