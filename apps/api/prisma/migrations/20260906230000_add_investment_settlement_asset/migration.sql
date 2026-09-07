ALTER TABLE "investment_transaction_details"
ADD COLUMN "settlement_asset_id" UUID;

CREATE INDEX "investment_transaction_details_settlement_asset_id_idx"
ON "investment_transaction_details"("settlement_asset_id");

ALTER TABLE "investment_transaction_details"
ADD CONSTRAINT "investment_transaction_details_settlement_asset_id_fkey"
FOREIGN KEY ("settlement_asset_id") REFERENCES "assets"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
