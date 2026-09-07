ALTER TYPE "TransactionType" ADD VALUE 'INVESTMENT_OPENING_POSITION';
ALTER TYPE "TradeType" ADD VALUE 'OPENING' BEFORE 'BUY';

CREATE TYPE "AssetLiquidityClass" AS ENUM ('INVESTMENT', 'CASH_EQUIVALENT');
CREATE TYPE "AssetLiquidityClassSource" AS ENUM ('AUTO', 'USER');

ALTER TABLE "assets"
ADD COLUMN "liquidity_class" "AssetLiquidityClass" NOT NULL DEFAULT 'INVESTMENT',
ADD COLUMN "liquidity_class_source" "AssetLiquidityClassSource" NOT NULL DEFAULT 'AUTO';

UPDATE "assets"
SET "liquidity_class" = 'CASH_EQUIVALENT'
WHERE "provider" = 'COINGECKO'
  AND "provider_asset_id" IN (
    'tether',
    'usd-coin',
    'dai',
    'binance-usd',
    'true-usd',
    'first-digital-usd',
    'paypal-usd',
    'frax'
  );

CREATE TABLE "portfolio_holdings" (
  "portfolio_id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "asset_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "portfolio_holdings_pkey"
    PRIMARY KEY ("portfolio_id", "account_id", "asset_id")
);

CREATE UNIQUE INDEX "portfolio_holdings_account_id_asset_id_key"
ON "portfolio_holdings"("account_id", "asset_id");
CREATE INDEX "portfolio_holdings_portfolio_id_idx"
ON "portfolio_holdings"("portfolio_id");
CREATE INDEX "portfolio_holdings_asset_id_idx"
ON "portfolio_holdings"("asset_id");

ALTER TABLE "portfolio_holdings"
ADD CONSTRAINT "portfolio_holdings_portfolio_id_fkey"
FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "portfolio_holdings"
ADD CONSTRAINT "portfolio_holdings_account_id_fkey"
FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "portfolio_holdings"
ADD CONSTRAINT "portfolio_holdings_asset_id_fkey"
FOREIGN KEY ("asset_id") REFERENCES "assets"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "portfolio_cash_allocations" (
  "portfolio_id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "percentage" DECIMAL(5,2) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "portfolio_cash_allocations_pkey"
    PRIMARY KEY ("portfolio_id", "account_id"),
  CONSTRAINT "portfolio_cash_allocations_percentage_check"
    CHECK ("percentage" >= 0 AND "percentage" <= 100)
);

CREATE INDEX "portfolio_cash_allocations_account_id_idx"
ON "portfolio_cash_allocations"("account_id");

ALTER TABLE "portfolio_cash_allocations"
ADD CONSTRAINT "portfolio_cash_allocations_portfolio_id_fkey"
FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "portfolio_cash_allocations"
ADD CONSTRAINT "portfolio_cash_allocations_account_id_fkey"
FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "watchlists" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "display_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "watchlists_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "watchlists_user_id_name_key"
ON "watchlists"("user_id", "name");
CREATE INDEX "watchlists_user_id_display_order_idx"
ON "watchlists"("user_id", "display_order");

ALTER TABLE "watchlists"
ADD CONSTRAINT "watchlists_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "watchlist_items" (
  "watchlist_id" UUID NOT NULL,
  "asset_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "watchlist_items_pkey" PRIMARY KEY ("watchlist_id", "asset_id")
);

CREATE INDEX "watchlist_items_asset_id_idx" ON "watchlist_items"("asset_id");

ALTER TABLE "watchlist_items"
ADD CONSTRAINT "watchlist_items_watchlist_id_fkey"
FOREIGN KEY ("watchlist_id") REFERENCES "watchlists"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "watchlist_items"
ADD CONSTRAINT "watchlist_items_asset_id_fkey"
FOREIGN KEY ("asset_id") REFERENCES "assets"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
