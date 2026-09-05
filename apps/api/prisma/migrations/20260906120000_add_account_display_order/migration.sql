ALTER TABLE "accounts"
ADD COLUMN "display_order" INTEGER NOT NULL DEFAULT 0;

WITH ranked_accounts AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "user_id"
      ORDER BY "created_at" DESC, "id"
    ) - 1 AS "position"
  FROM "accounts"
)
UPDATE "accounts"
SET "display_order" = ranked_accounts."position"
FROM ranked_accounts
WHERE "accounts"."id" = ranked_accounts."id";

CREATE INDEX "accounts_user_id_display_order_idx"
ON "accounts"("user_id", "display_order");
