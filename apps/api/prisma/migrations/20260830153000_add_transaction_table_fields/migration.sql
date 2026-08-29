CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'CLEARED', 'FAILED', 'VOIDED');

ALTER TABLE "transactions"
ADD COLUMN "status" "TransactionStatus" NOT NULL DEFAULT 'CLEARED',
ADD COLUMN "reference" TEXT,
ADD COLUMN "labels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "deleted_at" TIMESTAMP(3);

CREATE INDEX "transactions_user_id_status_occurred_at_idx"
ON "transactions"("user_id", "status", "occurred_at");

CREATE INDEX "transactions_user_id_type_idx"
ON "transactions"("user_id", "type");

CREATE INDEX "transactions_user_id_category_idx"
ON "transactions"("user_id", "category");

CREATE INDEX "transactions_account_id_occurred_at_idx"
ON "transactions"("account_id", "occurred_at");
