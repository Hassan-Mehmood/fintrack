import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { InvestmentsService } from './investments.service';
import type {
  HoldingsListResponse,
  InvestmentSummaryResponse,
} from './investments.types';
import { InvestmentReportQueryDto } from './dto/investment-report-query.dto';

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
}
