import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AnalyticsService } from './analytics.service';
import type { DashboardResponse } from './analytics.types';

@Controller('api/v1/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  async getDashboard(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DashboardResponse> {
    return {
      data: await this.analyticsService.getDashboardForUser(user),
    };
  }
}
