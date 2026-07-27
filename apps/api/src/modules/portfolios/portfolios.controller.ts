import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CreatePortfolioDto } from './dto/create-portfolio.dto';
import { UpdatePortfolioDto } from './dto/update-portfolio.dto';
import { PortfoliosService } from './portfolios.service';
import type {
  DeletePortfolioResponse,
  PortfolioItemResponse,
  PortfoliosListResponse,
} from './portfolios.types';

@Controller('api/v1/portfolios')
export class PortfoliosController {
  constructor(private readonly portfoliosService: PortfoliosService) {}

  @Get()
  async listPortfolios(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PortfoliosListResponse> {
    const portfolios = await this.portfoliosService.listPortfoliosForUser(user);

    return {
      data: portfolios,
      meta: {
        total: portfolios.length,
      },
    };
  }

  @Get(':portfolioId')
  async getPortfolio(
    @CurrentUser() user: AuthenticatedUser,
    @Param('portfolioId', new ParseUUIDPipe()) portfolioId: string,
  ): Promise<PortfolioItemResponse> {
    return {
      data: await this.portfoliosService.getPortfolioForUser(user, portfolioId),
    };
  }

  @Post()
  async createPortfolio(
    @CurrentUser() user: AuthenticatedUser,
    @Body() payload: CreatePortfolioDto,
  ): Promise<PortfolioItemResponse> {
    return {
      data: await this.portfoliosService.createPortfolioForUser(user, payload),
    };
  }

  @Patch(':portfolioId')
  async updatePortfolio(
    @CurrentUser() user: AuthenticatedUser,
    @Param('portfolioId', new ParseUUIDPipe()) portfolioId: string,
    @Body() payload: UpdatePortfolioDto,
  ): Promise<PortfolioItemResponse> {
    return {
      data: await this.portfoliosService.updatePortfolioForUser(
        user,
        portfolioId,
        payload,
      ),
    };
  }

  @Delete(':portfolioId')
  async deletePortfolio(
    @CurrentUser() user: AuthenticatedUser,
    @Param('portfolioId', new ParseUUIDPipe()) portfolioId: string,
  ): Promise<DeletePortfolioResponse> {
    await this.portfoliosService.deletePortfolioForUser(user, portfolioId);

    return {
      data: {
        id: portfolioId,
        deleted: true,
      },
    };
  }
}
