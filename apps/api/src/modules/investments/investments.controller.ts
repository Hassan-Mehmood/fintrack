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
import { InvestmentsService } from './investments.service';
import type {
  HoldingsListResponse,
  InvestmentSummaryResponse,
} from './investments.types';
import { InvestmentReportQueryDto } from './dto/investment-report-query.dto';
import { CreatePositionDto } from './dto/create-position.dto';
import type { PositionCommandResponse } from './investments.types';

@Controller('api/v1/investments')
export class InvestmentsController {
  constructor(private readonly investmentsService: InvestmentsService) {}

  @Get('holdings')
  async getHoldings(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: InvestmentReportQueryDto,
  ): Promise<HoldingsListResponse> {
    const { holdings, reportingCurrency } =
      await this.investmentsService.getHoldingsForUser(user, query);

    return {
      data: holdings,
      meta: {
        total: holdings.length,
        reportingCurrency,
        groupBy: query.groupBy,
      },
    };
  }

  @Get('summary')
  async getSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: InvestmentReportQueryDto,
  ): Promise<InvestmentSummaryResponse> {
    return this.investmentsService.getSummaryForUser(user, query);
  }

  @Post('positions')
  async createPosition(
    @CurrentUser() user: AuthenticatedUser,
    @Body() payload: CreatePositionDto,
  ): Promise<PositionCommandResponse> {
    return this.investmentsService.createPositionForUser(user, payload);
  }

  @Get('accounts/:accountId/summary')
  async getAccountSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('accountId', ParseUUIDPipe) accountId: string,
  ) {
    return {
      data: await this.investmentsService.getAccountSummaryForUser(
        user,
        accountId,
      ),
    };
  }
}
