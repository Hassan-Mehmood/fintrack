ALTER TABLE "users"
ADD COLUMN "exchange_rate_source" TEXT NOT NULL DEFAULT 'MANUAL_SETTINGS',
ADD COLUMN "exchange_rate_updated_at" TIMESTAMP(3);

UPDATE "users"
SET "exchange_rate_updated_at" = "updated_at"
WHERE "exchange_rate" IS NOT NULL;

ALTER TABLE "investment_transaction_details"
ADD COLUMN "price_currency" VARCHAR(3),
ADD COLUMN "fx_rate_usd_to_pkr" DECIMAL(24,8),
ADD COLUMN "fx_rate_source" TEXT,
ADD COLUMN "fx_rate_updated_at" TIMESTAMP(3);

UPDATE "investment_transaction_details" AS detail
SET "price_currency" = COALESCE(asset."price_currency", txn."currency")
FROM "assets" AS asset, "transactions" AS txn
WHERE detail."asset_id" = asset."id"
  AND detail."transaction_id" = txn."id";

ALTER TABLE "investment_transaction_details"
ALTER COLUMN "price_currency" SET NOT NULL;
