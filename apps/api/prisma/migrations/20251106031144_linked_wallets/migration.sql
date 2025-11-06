-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "linkedWallets" JSONB;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "linkedWallets" JSONB;
