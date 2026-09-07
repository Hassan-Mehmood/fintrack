import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

function error(
  code: string,
  message: string,
  details: Record<string, unknown> = {},
) {
  return { error: { code, message, details } };
}

export function settlementAssetRequiredException() {
  return new UnprocessableEntityException(
    error(
      'SETTLEMENT_ASSET_REQUIRED',
      'Crypto purchases and sales require a stablecoin settlement asset.',
    ),
  );
}

export function invalidSettlementAssetException(reason: string) {
  return new UnprocessableEntityException(
    error('INVALID_SETTLEMENT_ASSET', reason),
  );
}

export function settlementAssetNotFoundException(assetId?: string) {
  return new NotFoundException(
    error(
      'SETTLEMENT_ASSET_NOT_FOUND',
      'The selected settlement asset was not found.',
      assetId ? { assetId } : {},
    ),
  );
}

export function insufficientSettlementBalanceException(
  assetId: string,
  available: string,
  required: string,
) {
  return new UnprocessableEntityException(
    error(
      'INSUFFICIENT_SETTLEMENT_BALANCE',
      'The selected stablecoin balance is insufficient for this purchase.',
      { assetId, available, required },
    ),
  );
}

export function insufficientAccountCashException(
  accountId: string,
  available: string,
  required: string,
) {
  return new UnprocessableEntityException(
    error(
      'INSUFFICIENT_ACCOUNT_CASH',
      'The broker cash balance is insufficient for this purchase.',
      { accountId, available, required },
    ),
  );
}
