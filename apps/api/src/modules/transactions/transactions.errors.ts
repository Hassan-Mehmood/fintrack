import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

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

export function createTransactionNotFoundException(
  transactionId: string,
): NotFoundException {
  return new NotFoundException(
    buildApiError(
      'TRANSACTION_NOT_FOUND',
      'The requested transaction was not found.',
      { transactionId },
    ),
  );
}

export function createAccountNotFoundForTransactionException(
  accountId: string,
): NotFoundException {
  return new NotFoundException(
    buildApiError(
      'ACCOUNT_NOT_FOUND_FOR_TRANSACTION',
      'The selected account was not found.',
      { accountId },
    ),
  );
}

export function createTransactionLockedException(
  transactionId: string,
): ConflictException {
  return new ConflictException(
    buildApiError(
      'TRANSACTION_LOCKED',
      'This transaction has already been reversed or is a reversal and cannot be changed.',
      { transactionId },
    ),
  );
}

export function createTransactionNotReversibleException(
  transactionId: string,
): UnprocessableEntityException {
  return new UnprocessableEntityException(
    buildApiError(
      'TRANSACTION_NOT_REVERSIBLE',
      'This transaction type cannot be reversed.',
      { transactionId },
    ),
  );
}

export function createInvalidTransferException(
  reason: string,
): UnprocessableEntityException {
  return new UnprocessableEntityException(
    buildApiError('INVALID_TRANSFER', reason, {}),
  );
}
