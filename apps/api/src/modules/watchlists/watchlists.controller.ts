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
import { AddWatchlistItemDto, WatchlistNameDto } from './dto/watchlist.dto';
import { WatchlistsService } from './watchlists.service';

@Controller('api/v1/watchlists')
export class WatchlistsController {
  constructor(private readonly service: WatchlistsService) {}
  @Get() async list(@CurrentUser() user: AuthenticatedUser) {
    return { data: await this.service.list(user) };
  }
  @Post() async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() payload: WatchlistNameDto,
  ) {
    return { data: await this.service.create(user, payload) };
  }
  @Patch(':id') async rename(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: WatchlistNameDto,
  ) {
    return { data: await this.service.rename(user, id, payload) };
  }
  @Delete(':id') async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.service.remove(user, id);
    return { data: { id, deleted: true } };
  }
  @Post(':id/items') async addItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: AddWatchlistItemDto,
  ) {
    return { data: await this.service.addItem(user, id, payload) };
  }
  @Delete(':id/items/:assetId') async removeItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ) {
    await this.service.removeItem(user, id, assetId);
    return { data: { id: assetId, deleted: true } };
  }
}
