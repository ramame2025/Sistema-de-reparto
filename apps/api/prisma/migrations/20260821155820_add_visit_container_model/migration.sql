-- CreateEnum
CREATE TYPE "SaleKind" AS ENUM ('sale', 'churn');

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "containerReturned" BOOLEAN,
ADD COLUMN     "kind" "SaleKind" NOT NULL DEFAULT 'sale',
ALTER COLUMN "paymentMethod" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Sale_kind_createdAt_idx" ON "Sale"("kind", "createdAt");
