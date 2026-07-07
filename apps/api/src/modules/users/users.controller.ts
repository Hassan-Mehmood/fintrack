import { Controller, Get, Put, Body } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { UsersService } from './users.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Controller('api/v1/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getCurrentUser(@CurrentUser() user: AuthenticatedUser): {
    data: AuthenticatedUser;
  } {
    return { data: user };
  }

  @Get('me/settings')
  async getSettings(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: { baseCurrency: string; exchangeRate: string | null } }> {
    const settings = await this.usersService.getSettings(user.id);
    return { data: settings };
  }

  @Put('me/settings')
  async updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() payload: UpdateSettingsDto,
  ): Promise<{ data: { baseCurrency: string; exchangeRate: string | null } }> {
    const updated = await this.usersService.updateSettings(user.id, payload);
    return { data: updated };
  }
}
