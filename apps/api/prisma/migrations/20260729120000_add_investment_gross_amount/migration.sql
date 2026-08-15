ALTER TABLE "investment_transaction_details"
ADD COLUMN "gross_amount" DECIMAL(24, 8);

UPDATE "investment_transaction_details"
SET "gross_amount" = ROUND("quantity" * "price", 8);

ALTER TABLE "investment_transaction_details"
ALTER COLUMN "gross_amount" SET NOT NULL;
