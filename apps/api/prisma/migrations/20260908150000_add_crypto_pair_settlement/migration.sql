ALTER TABLE "investment_transaction_details"
  ADD COLUMN "settlement_rate" DECIMAL(24, 8),
  ADD COLUMN "settlement_quantity" DECIMAL(24, 8);
