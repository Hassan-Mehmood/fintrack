import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CategoriesService } from './categories.service';
import type { CategoriesResponse } from './categories.types';

@Controller('api/v1/categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  async listCategories(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CategoriesResponse> {
    return { data: await this.categoriesService.listForUser(user.id) };
  }
}
