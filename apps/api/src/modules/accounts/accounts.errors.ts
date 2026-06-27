import { ConflictException, NotFoundException } from '@nestjs/common';

interface ApiErrorDetails {
  readonly [key: string]: unknown;
}

function buildApiError(
  code: string,
  message: string,
  details: ApiErrorDetails = {},
): { error: { code: string; message: string; details: ApiErrorDetails } } {
  return {
    error: {
      code,
      message,
      details,
    },
  };
}

export function createAccountNotFoundException(accountId: string): NotFoundException {
  return new NotFoundException(
    buildApiError('ACCOUNT_NOT_FOUND', 'The requested account was not found.', {
      accountId,
    }),
  );
}

export function createAccountHasTransactionsException(
  accountId: string,
): ConflictException {
  return new ConflictException(
    buildApiError(
      'ACCOUNT_HAS_TRANSACTIONS',
      'Accounts with recorded transactions cannot be deleted.',
      { accountId },
    ),
  );
}
