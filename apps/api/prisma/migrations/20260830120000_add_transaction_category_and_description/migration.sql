ALTER TABLE "transactions"
RENAME COLUMN "description" TO "category";

ALTER TABLE "transactions"
ADD COLUMN "description" TEXT;

UPDATE "transactions"
SET "description" = '';

ALTER TABLE "transactions"
ALTER COLUMN "description" SET NOT NULL;
