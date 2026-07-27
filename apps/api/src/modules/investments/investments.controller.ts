import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { InvestmentsService } from './investments.service';
import type {
  HoldingsListResponse,
  InvestmentSummaryResponse,
} from './investments.types';

@Controller('api/v1/investments')
export class InvestmentsController {
  constructor(private readonly investmentsService: InvestmentsService) {}

  @Get('holdings')
  async getHoldings(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<HoldingsListResponse> {
    const { holdings, baseCurrency } =
      await this.investmentsService.getHoldingsForUser(user);

    return {
      data: holdings,
      meta: {
        total: holdings.length,
        baseCurrency,
      },
    };
  }

  @Get('summary')
  async getSummary(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<InvestmentSummaryResponse> {
    return this.investmentsService.getSummaryForUser(user);
  }
}
