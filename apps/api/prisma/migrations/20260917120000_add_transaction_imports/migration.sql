CREATE TABLE "transaction_imports" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "source_format" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "file_checksum" TEXT NOT NULL,
  "idempotency_key" UUID NOT NULL,
  "source_row_count" INTEGER NOT NULL,
  "imported_count" INTEGER NOT NULL,
  "skipped_duplicate_count" INTEGER NOT NULL,
  "adjustment_count" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "transaction_imports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "transaction_import_account_mappings" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "source_format" TEXT NOT NULL,
  "source_account_key" TEXT NOT NULL,
  "source_account_name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "transaction_import_account_mappings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "transactions" ADD COLUMN "import_id" UUID;
ALTER TABLE "transactions" ADD COLUMN "import_fingerprint" TEXT;
CREATE UNIQUE INDEX "transactions_user_id_import_fingerprint_key" ON "transactions"("user_id", "import_fingerprint");
CREATE UNIQUE INDEX "transaction_imports_user_id_idempotency_key_key" ON "transaction_imports"("user_id", "idempotency_key");
CREATE INDEX "transaction_imports_user_id_created_at_idx" ON "transaction_imports"("user_id", "created_at");
CREATE UNIQUE INDEX "transaction_import_account_mappings_user_id_source_format_source_account_key_key" ON "transaction_import_account_mappings"("user_id", "source_format", "source_account_key");
CREATE INDEX "transaction_import_account_mappings_account_id_idx" ON "transaction_import_account_mappings"("account_id");
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "transaction_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "transaction_imports" ADD CONSTRAINT "transaction_imports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transaction_import_account_mappings" ADD CONSTRAINT "transaction_import_account_mappings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transaction_import_account_mappings" ADD CONSTRAINT "transaction_import_account_mappings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
