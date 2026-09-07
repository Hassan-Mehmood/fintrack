export const CASH_EQUIVALENT_COINGECKO_IDS = new Set([
  'tether',
  'usd-coin',
  'dai',
  'binance-usd',
  'true-usd',
  'first-digital-usd',
  'paypal-usd',
  'frax',
]);

export function isAutomaticCashEquivalent(
  provider: string,
  providerAssetId: string,
): boolean {
  return (
    provider === 'COINGECKO' &&
    CASH_EQUIVALENT_COINGECKO_IDS.has(providerAssetId.toLocaleLowerCase())
  );
}
