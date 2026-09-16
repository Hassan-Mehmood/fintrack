import { Body, Controller, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  CommitTransactionImportDto,
  PreviewTransactionImportDto,
} from './dto/transaction-import.dto';
import { TransactionImportsService } from './transaction-imports.service';

@Controller('api/v1/transaction-imports')
export class TransactionImportsController {
  constructor(private readonly service: TransactionImportsService) {}
  @Post('preview') preview(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PreviewTransactionImportDto,
  ) {
    return this.service.preview(user, dto);
  }
  @Post() commit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CommitTransactionImportDto,
  ) {
    return this.service.commit(user, dto);
  }
}
