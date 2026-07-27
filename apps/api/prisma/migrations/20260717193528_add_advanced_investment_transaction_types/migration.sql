-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransactionType" ADD VALUE 'DIVIDEND';
ALTER TYPE "TransactionType" ADD VALUE 'INTEREST';
ALTER TYPE "TransactionType" ADD VALUE 'INVESTMENT_SPLIT';
ALTER TYPE "TransactionType" ADD VALUE 'INVESTMENT_BONUS';
ALTER TYPE "TransactionType" ADD VALUE 'INVESTMENT_REINVESTMENT';
