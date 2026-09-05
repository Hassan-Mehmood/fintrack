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

export function createInvalidTransactionCategoryException(
  transactionType: string,
  category: string,
): UnprocessableEntityException {
  return new UnprocessableEntityException(
    buildApiError(
      'INVALID_TRANSACTION_CATEGORY',
      'Select a category available for this transaction type.',
      { transactionType, category },
    ),
  );
}

export function createTransactionCurrencyMismatchException(
  accountCurrency: string,
  transactionCurrency: string,
): UnprocessableEntityException {
  return new UnprocessableEntityException(
    buildApiError(
      'TRANSACTION_CURRENCY_MISMATCH',
      `Transaction currency must match the selected account currency (${accountCurrency}).`,
      { accountCurrency, transactionCurrency },
    ),
  );
}

export function createInvestmentDetailRequiredException(
  transactionType: string,
): UnprocessableEntityException {
  return new UnprocessableEntityException(
    buildApiError(
      'INVESTMENT_DETAIL_REQUIRED',
      `Investment transactions require asset, quantity, and price details.`,
      { transactionType },
    ),
  );
}

export function createInvalidInvestmentTradeTypeException(
  expectedTradeType: string,
  actualTradeType: string,
): UnprocessableEntityException {
  return new UnprocessableEntityException(
    buildApiError(
      'INVALID_INVESTMENT_TRADE_TYPE',
      `Trade type must be ${expectedTradeType} for this transaction type.`,
      { expectedTradeType, actualTradeType },
    ),
  );
}

export function createAssetNotFoundForTransactionException(
  assetId: string,
): NotFoundException {
  return new NotFoundException(
    buildApiError(
      'ASSET_NOT_FOUND_FOR_TRANSACTION',
      'The selected asset was not found.',
      { assetId },
    ),
  );
}

export function createInvalidInvestmentAmountException(
  reason: string,
): UnprocessableEntityException {
  return new UnprocessableEntityException(
    buildApiError('INVALID_INVESTMENT_AMOUNT', reason, {}),
  );
}

export function createInvalidTransactionAmountException(
  reason: string,
): UnprocessableEntityException {
  return new UnprocessableEntityException(
    buildApiError('INVALID_TRANSACTION_AMOUNT', reason, {}),
  );
}

export function createInvalidInvestmentAccountException(): UnprocessableEntityException {
  return new UnprocessableEntityException(
    buildApiError(
      'INVALID_INVESTMENT_ACCOUNT',
      'Investment transactions require a broker or cryptocurrency-wallet account.',
    ),
  );
}

export function createInsufficientHoldingException(
  assetId: string,
): UnprocessableEntityException {
  return new UnprocessableEntityException(
    buildApiError(
      'INSUFFICIENT_HOLDING',
      'The transaction quantity exceeds the current holding.',
      { assetId },
    ),
  );
}

export function createInvalidBulkTransactionException(
  reason: string,
): UnprocessableEntityException {
  return new UnprocessableEntityException(
    buildApiError('INVALID_BULK_TRANSACTION_UPDATE', reason, {}),
  );
}
