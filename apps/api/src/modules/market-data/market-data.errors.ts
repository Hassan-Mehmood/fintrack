import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';

function errorBody(
  code: string,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
) {
  return { error: { code, message, details } };
}

export function invalidMarketSearchException(): BadRequestException {
  return new BadRequestException(
    errorBody(
      'INVALID_MARKET_SEARCH',
      'Search queries must contain between 2 and 80 characters.',
    ),
  );
}

export function providerAssetNotFoundException(
  providerAssetId: string,
): NotFoundException {
  return new NotFoundException(
    errorBody(
      'PROVIDER_ASSET_NOT_FOUND',
      'The selected provider asset could not be verified.',
      { providerAssetId },
    ),
  );
}

export function marketProviderFailureException(
  provider: string,
): BadGatewayException {
  return new BadGatewayException(
    errorBody(
      'MARKET_PROVIDER_FAILURE',
      'The market-data provider is temporarily unavailable.',
      { provider },
    ),
  );
}

export function marketProviderRateLimitException(
  provider: string,
): HttpException {
  return new HttpException(
    errorBody(
      'MARKET_PROVIDER_RATE_LIMITED',
      'The market-data provider request budget has been reached.',
      { provider },
    ),
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

export function invalidMarketHistoryException(): BadRequestException {
  return new BadRequestException(
    errorBody(
      'INVALID_MARKET_HISTORY_RANGE',
      'History dates must be valid, ordered, and span no more than 366 days.',
    ),
  );
}

export function unsupportedMarketHistoryException(): BadRequestException {
  return new BadRequestException(
    errorBody(
      'MARKET_HISTORY_UNSUPPORTED',
      'Historical prices are not supported for this asset provider.',
    ),
  );
}
