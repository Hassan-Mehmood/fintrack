-- Cryptocurrency wallets no longer carry a separate fiat ledger balance.
-- Preserve the existing ledger and add one audited offset per non-zero wallet.
WITH "crypto_wallet_balances" AS (
  SELECT
    "account"."id" AS "account_id",
    "account"."user_id",
    "account"."currency",
    "account"."opening_balance" + COALESCE(SUM(
      CASE
        WHEN "transaction"."account_id" = "account"."id" THEN
          CASE
            WHEN "transaction"."type" IN ('INCOME', 'REFUND', 'INVESTMENT_SELL', 'DIVIDEND', 'INTEREST')
              THEN "transaction"."amount"
            WHEN "transaction"."type" IN ('EXPENSE', 'FEE', 'INVESTMENT_BUY', 'INVESTMENT_REINVESTMENT', 'TRANSFER')
              THEN -"transaction"."amount"
            WHEN "transaction"."type" = 'ADJUSTMENT'
              THEN "transaction"."amount"
            ELSE 0
          END
        ELSE 0
      END
      + CASE
          WHEN "transaction"."destination_account_id" = "account"."id"
            AND "transaction"."type" IN ('TRANSFER', 'INVESTMENT_BUY')
            THEN "transaction"."amount"
          ELSE 0
        END
    ), 0) AS "fiat_balance"
  FROM "accounts" AS "account"
  LEFT JOIN "transactions" AS "transaction"
    ON (
      "transaction"."account_id" = "account"."id"
      OR "transaction"."destination_account_id" = "account"."id"
    )
    AND "transaction"."status" = 'CLEARED'
    AND "transaction"."deleted_at" IS NULL
  WHERE "account"."type" = 'CRYPTO_WALLET'
  GROUP BY
    "account"."id",
    "account"."user_id",
    "account"."currency",
    "account"."opening_balance"
)
INSERT INTO "transactions" (
  "id",
  "user_id",
  "account_id",
  "type",
  "status",
  "idempotency_key",
  "amount",
  "currency",
  "occurred_at",
  "category",
  "description",
  "notes",
  "reference",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  "user_id",
  "account_id",
  'ADJUSTMENT',
  'CLEARED',
  gen_random_uuid(),
  -"fiat_balance",
  "currency",
  CURRENT_TIMESTAMP,
  'Crypto wallet cash migration',
  'Removed duplicate fiat cash from stablecoin-only crypto wallet',
  'The previous fiat ledger balance was automatically offset. Stablecoin holdings remain unchanged.',
  'stablecoin-only-crypto-cash-reset:v1',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "crypto_wallet_balances"
WHERE "fiat_balance" <> 0;

-- Stablecoins are portfolio holdings, so crypto portfolios no longer allocate
-- percentages of a separate fiat balance.
DELETE FROM "portfolio_cash_allocations" AS "allocation"
USING "portfolios" AS "portfolio"
WHERE "allocation"."portfolio_id" = "portfolio"."id"
  AND "portfolio"."domain" = 'CRYPTO';
