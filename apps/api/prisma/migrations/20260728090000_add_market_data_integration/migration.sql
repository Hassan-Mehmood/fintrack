-- CreateEnum
CREATE TYPE "AssetProvider" AS ENUM ('FINNHUB', 'COINGECKO');

-- CreateEnum
CREATE TYPE "AssetMarketType" AS ENUM ('STOCK', 'CRYPTO');

-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'INVESTMENT_DEPOSIT';
ALTER TYPE "TransactionType" ADD VALUE 'INVESTMENT_WITHDRAWAL';

-- AlterTable
ALTER TABLE "transactions"
ADD COLUMN "idempotency_key" UUID NOT NULL DEFAULT gen_random_uuid();

-- AlterTable
ALTER TABLE "assets"
ADD COLUMN "provider" "AssetProvider",
ADD COLUMN "market_type" "AssetMarketType",
ADD COLUMN "provider_asset_id" TEXT,
ADD COLUMN "exchange" TEXT,
ADD COLUMN "image_url" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "transactions_user_id_idempotency_key_key"
ON "transactions"("user_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "assets_user_id_provider_provider_asset_id_key"
ON "assets"("user_id", "provider", "provider_asset_id");
