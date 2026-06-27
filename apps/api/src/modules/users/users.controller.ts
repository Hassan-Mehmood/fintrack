import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Controller('api/v1/users')
export class UsersController {
  @Get('me')
  getCurrentUser(@CurrentUser() user: AuthenticatedUser): {
    data: AuthenticatedUser;
  } {
    return { data: user };
  }
}
