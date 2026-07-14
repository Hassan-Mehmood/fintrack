import { NotFoundException } from '@nestjs/common';

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

export function createAssetNotFoundException(
  assetId: string,
): NotFoundException {
  return new NotFoundException(
    buildApiError('ASSET_NOT_FOUND', 'The requested asset was not found.', {
      assetId,
    }),
  );
}

export function createAssetCategoryNotFoundException(
  categoryId: string,
): NotFoundException {
  return new NotFoundException(
    buildApiError(
      'ASSET_CATEGORY_NOT_FOUND',
      'The requested asset category was not found.',
      { categoryId },
    ),
  );
}

export function createRiskProfileNotFoundException(
  riskProfileId: string,
): NotFoundException {
  return new NotFoundException(
    buildApiError(
      'RISK_PROFILE_NOT_FOUND',
      'The requested risk profile was not found.',
      { riskProfileId },
    ),
  );
}
