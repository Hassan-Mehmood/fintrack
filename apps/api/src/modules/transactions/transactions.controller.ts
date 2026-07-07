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
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { TransactionsService } from './transactions.service';
import type {
  DeleteTransactionResponse,
  TransactionItemResponse,
  TransactionsListResponse,
} from './transactions.types';

@Controller('api/v1/transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  async listTransactions(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TransactionsListResponse> {
    const transactions =
      await this.transactionsService.listTransactionsForUser(user);

    return {
      data: transactions,
      meta: {
        total: transactions.length,
      },
    };
  }

  @Get(':transactionId')
  async getTransaction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('transactionId', new ParseUUIDPipe()) transactionId: string,
  ): Promise<TransactionItemResponse> {
    return {
      data: await this.transactionsService.getTransactionForUser(
        user,
        transactionId,
      ),
    };
  }

  @Post()
  async createTransaction(
    @CurrentUser() user: AuthenticatedUser,
    @Body() payload: CreateTransactionDto,
  ): Promise<TransactionItemResponse> {
    return {
      data: await this.transactionsService.createTransactionForUser(
        user,
        payload,
      ),
    };
  }

  @Patch(':transactionId')
  async updateTransaction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('transactionId', new ParseUUIDPipe()) transactionId: string,
    @Body() payload: UpdateTransactionDto,
  ): Promise<TransactionItemResponse> {
    return {
      data: await this.transactionsService.updateTransactionForUser(
        user,
        transactionId,
        payload,
      ),
    };
  }

  @Post(':transactionId/reverse')
  async reverseTransaction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('transactionId', new ParseUUIDPipe()) transactionId: string,
  ): Promise<TransactionItemResponse> {
    return {
      data: await this.transactionsService.reverseTransactionForUser(
        user,
        transactionId,
      ),
    };
  }

  @Delete(':transactionId')
  async deleteTransaction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('transactionId', new ParseUUIDPipe()) transactionId: string,
  ): Promise<DeleteTransactionResponse> {
    await this.transactionsService.deleteTransactionForUser(
      user,
      transactionId,
    );

    return {
      data: {
        id: transactionId,
        deleted: true,
      },
    };
  }
}
