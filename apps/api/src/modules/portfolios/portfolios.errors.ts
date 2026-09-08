import {
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

export function createPortfolioNotFoundException(
  portfolioId: string,
): NotFoundException {
  return new NotFoundException(
    buildApiError(
      'PORTFOLIO_NOT_FOUND',
      'The requested portfolio was not found.',
      { portfolioId },
    ),
  );
}

export function createAccountNotFoundForPortfolioException(
  accountId: string,
): NotFoundException {
  return new NotFoundException(
    buildApiError(
      'ACCOUNT_NOT_FOUND_FOR_PORTFOLIO',
      'One or more selected accounts were not found.',
      { accountId },
    ),
  );
}

export function createCryptoPortfolioCashNotSupportedException(): UnprocessableEntityException {
  return new UnprocessableEntityException(
    buildApiError(
      'CRYPTO_PORTFOLIO_CASH_NOT_SUPPORTED',
      'Crypto portfolios use stablecoin positions instead of fiat cash allocations.',
    ),
  );
}
