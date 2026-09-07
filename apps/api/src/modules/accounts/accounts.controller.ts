import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Body,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AccountsService } from './accounts.service';
import type {
  AccountItemResponse,
  AccountsListResponse,
  DeleteAccountResponse,
  ReorderAccountsResponse,
} from './accounts.types';
import { CreateAccountDto } from './dto/create-account.dto';
import { AdjustAccountBalanceDto } from './dto/adjust-account-balance.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { ReorderAccountsDto } from './dto/reorder-accounts.dto';
import { TransactionsService } from '../transactions/transactions.service';
import { ListTransactionsQueryDto } from '../transactions/dto/list-transactions-query.dto';
import type { AccountTransactionsListResponse } from '../transactions/transactions.types';
import { ListAccountsQueryDto } from './dto/list-accounts-query.dto';

@Controller('api/v1/accounts')
export class AccountsController {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly transactionsService: TransactionsService,
  ) {}

  @Get()
  async listAccounts(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAccountsQueryDto,
  ): Promise<AccountsListResponse> {
    const accounts = await this.accountsService.listAccountsForUser(
      user,
      query.scope,
    );

    return {
      data: accounts,
      meta: {
        total: accounts.length,
      },
    };
  }

  @Get(':accountId')
  async getAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
  ): Promise<AccountItemResponse> {
    return {
      data: await this.accountsService.getAccountForUser(user, accountId),
    };
  }

  @Get(':accountId/transactions')
  async listAccountTransactions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
    @Query() query: ListTransactionsQueryDto,
  ): Promise<AccountTransactionsListResponse> {
    return this.transactionsService.listAccountTransactionsForUser(
      user,
      accountId,
      query,
    );
  }

  @Post()
  async createAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body() payload: CreateAccountDto,
  ): Promise<AccountItemResponse> {
    return {
      data: await this.accountsService.createAccountForUser(user, payload),
    };
  }

  @Put('order')
  async reorderAccounts(
    @CurrentUser() user: AuthenticatedUser,
    @Body() payload: ReorderAccountsDto,
  ): Promise<ReorderAccountsResponse> {
    const accountIds = await this.accountsService.reorderAccountsForUser(
      user,
      payload.accountIds,
    );
    return { data: { accountIds } };
  }

  @Patch(':accountId')
  async updateAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
    @Body() payload: UpdateAccountDto,
  ): Promise<AccountItemResponse> {
    return {
      data: await this.accountsService.updateAccountForUser(
        user,
        accountId,
        payload,
      ),
    };
  }

  @Post(':accountId/balance-adjustments')
  async adjustBalance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
    @Body() payload: AdjustAccountBalanceDto,
  ): Promise<AccountItemResponse> {
    return {
      data: await this.accountsService.adjustBalanceForUser(
        user,
        accountId,
        payload,
      ),
    };
  }

  @Delete(':accountId')
  async deleteAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
  ): Promise<DeleteAccountResponse> {
    await this.accountsService.deleteAccountForUser(user, accountId);

    return {
      data: {
        id: accountId,
        deleted: true,
      },
    };
  }
}
