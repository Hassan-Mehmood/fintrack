import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { GetMarketPricesDto } from './dto/get-market-prices.dto';
import { GetMarketHistoryDto } from './dto/get-market-history.dto';
import { ListMarketSymbolsDto } from './dto/list-market-symbols.dto';
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
      query.exchange,
    );
    return { data: results, meta: { total: results.length } };
  }

  @Get('symbols')
  async symbols(@Query() query: ListMarketSymbolsDto) {
    const results = await this.marketDataService.listSymbols(query.exchange);
    return { data: results, meta: { total: results.length } };
  }

  @Get('assets/:assetId/history')
  async history(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Query() query: GetMarketHistoryDto,
  ) {
    const history = await this.marketDataService.getHistoryForUser(
      user,
      assetId,
      query.from,
      query.to,
    );
    return { data: history, meta: { total: history.bars.length } };
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
