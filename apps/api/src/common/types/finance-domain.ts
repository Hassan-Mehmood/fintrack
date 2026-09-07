export type FinanceScope = 'MONEY' | 'SECURITIES' | 'CRYPTO';
export type InvestmentDomain = 'SECURITIES' | 'CRYPTO';

export const accountTypesByScope = {
  MONEY: ['BANK', 'CASH_WALLET', 'DIGITAL_WALLET'],
  SECURITIES: ['BROKER'],
  CRYPTO: ['CRYPTO_WALLET'],
} as const;
