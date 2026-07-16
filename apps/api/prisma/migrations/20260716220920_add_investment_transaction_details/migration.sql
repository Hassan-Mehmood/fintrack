-- CreateEnum
CREATE TYPE "TradeType" AS ENUM ('BUY', 'SELL', 'DIVIDEND', 'INTEREST', 'DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'SPLIT', 'BONUS', 'FEE', 'TAX', 'REINVESTMENT');

-- CreateTable
CREATE TABLE "investment_transaction_details" (
    "id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "trade_type" "TradeType" NOT NULL,
    "quantity" DECIMAL(24,8) NOT NULL,
    "price" DECIMAL(24,8) NOT NULL,
    "fees" DECIMAL(24,8) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investment_transaction_details_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "investment_transaction_details_transaction_id_key" ON "investment_transaction_details"("transaction_id");

-- CreateIndex
CREATE INDEX "investment_transaction_details_asset_id_idx" ON "investment_transaction_details"("asset_id");

-- CreateIndex
CREATE INDEX "investment_transaction_details_transaction_id_idx" ON "investment_transaction_details"("transaction_id");

-- AddForeignKey
ALTER TABLE "investment_transaction_details" ADD CONSTRAINT "investment_transaction_details_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_transaction_details" ADD CONSTRAINT "investment_transaction_details_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
