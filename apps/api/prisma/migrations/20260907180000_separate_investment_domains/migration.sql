CREATE TYPE "InvestmentDomain" AS ENUM ('SECURITIES', 'CRYPTO');

ALTER TABLE "assets" ADD COLUMN "domain" "InvestmentDomain";
ALTER TABLE "portfolios" ADD COLUMN "domain" "InvestmentDomain";
ALTER TABLE "watchlists" ADD COLUMN "domain" "InvestmentDomain";

UPDATE "assets"
SET "domain" = CASE
  WHEN "market_type" = 'CRYPTO' THEN 'CRYPTO'::"InvestmentDomain"
  ELSE 'SECURITIES'::"InvestmentDomain"
END;

DO $$
DECLARE
  portfolio_row RECORD;
  crypto_portfolio_id UUID;
  stock_name TEXT;
  crypto_name TEXT;
  suffix_number INTEGER;
  has_securities BOOLEAN;
  has_crypto BOOLEAN;
BEGIN
  FOR portfolio_row IN SELECT * FROM "portfolios" ORDER BY "created_at", "id" LOOP
    SELECT EXISTS (
      SELECT 1 FROM "portfolio_holdings" ph
      JOIN "assets" a ON a."id" = ph."asset_id"
      WHERE ph."portfolio_id" = portfolio_row."id" AND a."domain" = 'SECURITIES'
      UNION ALL
      SELECT 1 FROM "portfolio_cash_allocations" pca
      JOIN "accounts" ac ON ac."id" = pca."account_id"
      WHERE pca."portfolio_id" = portfolio_row."id" AND ac."type" = 'BROKER'
      UNION ALL
      SELECT 1 FROM "portfolio_accounts" pa
      JOIN "accounts" ac ON ac."id" = pa."account_id"
      WHERE pa."portfolio_id" = portfolio_row."id" AND ac."type" = 'BROKER'
    ) INTO has_securities;

    SELECT EXISTS (
      SELECT 1 FROM "portfolio_holdings" ph
      JOIN "assets" a ON a."id" = ph."asset_id"
      WHERE ph."portfolio_id" = portfolio_row."id" AND a."domain" = 'CRYPTO'
      UNION ALL
      SELECT 1 FROM "portfolio_cash_allocations" pca
      JOIN "accounts" ac ON ac."id" = pca."account_id"
      WHERE pca."portfolio_id" = portfolio_row."id" AND ac."type" = 'CRYPTO_WALLET'
      UNION ALL
      SELECT 1 FROM "portfolio_accounts" pa
      JOIN "accounts" ac ON ac."id" = pa."account_id"
      WHERE pa."portfolio_id" = portfolio_row."id" AND ac."type" = 'CRYPTO_WALLET'
    ) INTO has_crypto;

    IF has_securities AND has_crypto THEN
      stock_name := portfolio_row."name" || ' · Stocks';
      suffix_number := 2;
      WHILE EXISTS (SELECT 1 FROM "portfolios" WHERE "user_id" = portfolio_row."user_id" AND "name" = stock_name AND "id" <> portfolio_row."id") LOOP
        stock_name := portfolio_row."name" || ' · Stocks ' || suffix_number;
        suffix_number := suffix_number + 1;
      END LOOP;
      crypto_name := portfolio_row."name" || ' · Crypto';
      suffix_number := 2;
      WHILE EXISTS (SELECT 1 FROM "portfolios" WHERE "user_id" = portfolio_row."user_id" AND "name" = crypto_name) LOOP
        crypto_name := portfolio_row."name" || ' · Crypto ' || suffix_number;
        suffix_number := suffix_number + 1;
      END LOOP;
      UPDATE "portfolios" SET "name" = stock_name, "domain" = 'SECURITIES' WHERE "id" = portfolio_row."id";
      crypto_portfolio_id := gen_random_uuid();
      INSERT INTO "portfolios" ("id", "user_id", "name", "description", "domain", "created_at", "updated_at")
      VALUES (crypto_portfolio_id, portfolio_row."user_id", crypto_name, portfolio_row."description", 'CRYPTO', portfolio_row."created_at", portfolio_row."updated_at");
      UPDATE "portfolio_holdings" ph SET "portfolio_id" = crypto_portfolio_id
      FROM "assets" a WHERE ph."portfolio_id" = portfolio_row."id" AND ph."asset_id" = a."id" AND a."domain" = 'CRYPTO';
      UPDATE "portfolio_cash_allocations" pca SET "portfolio_id" = crypto_portfolio_id
      FROM "accounts" ac WHERE pca."portfolio_id" = portfolio_row."id" AND pca."account_id" = ac."id" AND ac."type" = 'CRYPTO_WALLET';
      UPDATE "portfolio_accounts" pa SET "portfolio_id" = crypto_portfolio_id
      FROM "accounts" ac WHERE pa."portfolio_id" = portfolio_row."id" AND pa."account_id" = ac."id" AND ac."type" = 'CRYPTO_WALLET';
    ELSIF has_crypto THEN
      UPDATE "portfolios" SET "domain" = 'CRYPTO' WHERE "id" = portfolio_row."id";
    ELSE
      UPDATE "portfolios" SET "domain" = 'SECURITIES' WHERE "id" = portfolio_row."id";
    END IF;
  END LOOP;
END $$;

DROP INDEX IF EXISTS "watchlists_user_id_name_key";

DO $$
DECLARE
  watchlist_row RECORD;
  crypto_watchlist_id UUID;
  stock_name TEXT;
  crypto_name TEXT;
  candidate_name TEXT;
  suffix_number INTEGER;
  has_securities BOOLEAN;
  has_crypto BOOLEAN;
BEGIN
  FOR watchlist_row IN SELECT * FROM "watchlists" ORDER BY "display_order", "created_at", "id" LOOP
    SELECT EXISTS (
      SELECT 1 FROM "watchlist_items" wi JOIN "assets" a ON a."id" = wi."asset_id"
      WHERE wi."watchlist_id" = watchlist_row."id" AND a."domain" = 'SECURITIES'
    ) INTO has_securities;
    SELECT EXISTS (
      SELECT 1 FROM "watchlist_items" wi JOIN "assets" a ON a."id" = wi."asset_id"
      WHERE wi."watchlist_id" = watchlist_row."id" AND a."domain" = 'CRYPTO'
    ) INTO has_crypto;

    IF has_securities AND has_crypto THEN
      stock_name := watchlist_row."name" || ' · Stocks';
      suffix_number := 2;
      candidate_name := stock_name;
      WHILE EXISTS (SELECT 1 FROM "watchlists" WHERE "user_id" = watchlist_row."user_id" AND "name" = candidate_name AND "id" <> watchlist_row."id") LOOP
        candidate_name := stock_name || ' ' || suffix_number;
        suffix_number := suffix_number + 1;
      END LOOP;
      stock_name := candidate_name;

      crypto_name := watchlist_row."name" || ' · Crypto';
      suffix_number := 2;
      candidate_name := crypto_name;
      WHILE EXISTS (SELECT 1 FROM "watchlists" WHERE "user_id" = watchlist_row."user_id" AND "name" = candidate_name) LOOP
        candidate_name := crypto_name || ' ' || suffix_number;
        suffix_number := suffix_number + 1;
      END LOOP;
      crypto_name := candidate_name;

      UPDATE "watchlists" SET "name" = stock_name, "domain" = 'SECURITIES' WHERE "id" = watchlist_row."id";
      crypto_watchlist_id := gen_random_uuid();
      INSERT INTO "watchlists" ("id", "user_id", "name", "display_order", "domain", "created_at", "updated_at")
      VALUES (crypto_watchlist_id, watchlist_row."user_id", crypto_name, watchlist_row."display_order", 'CRYPTO', watchlist_row."created_at", watchlist_row."updated_at");
      UPDATE "watchlist_items" wi SET "watchlist_id" = crypto_watchlist_id
      FROM "assets" a WHERE wi."watchlist_id" = watchlist_row."id" AND wi."asset_id" = a."id" AND a."domain" = 'CRYPTO';
    ELSIF has_crypto THEN
      UPDATE "watchlists" SET "domain" = 'CRYPTO' WHERE "id" = watchlist_row."id";
    ELSE
      UPDATE "watchlists" SET "domain" = 'SECURITIES' WHERE "id" = watchlist_row."id";
    END IF;
  END LOOP;
END $$;

ALTER TABLE "assets" ALTER COLUMN "domain" SET NOT NULL;
ALTER TABLE "portfolios" ALTER COLUMN "domain" SET NOT NULL;
ALTER TABLE "watchlists" ALTER COLUMN "domain" SET NOT NULL;

CREATE INDEX "assets_user_id_domain_idx" ON "assets"("user_id", "domain");
CREATE UNIQUE INDEX "watchlists_user_id_domain_name_key" ON "watchlists"("user_id", "domain", "name");
