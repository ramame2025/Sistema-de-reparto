-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('final', 'comercio', 'distribuidor');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('efectivo', 'transferencia', 'qr', 'tarjeta');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('active', 'canceled');

-- CreateEnum
CREATE TYPE "SaleAuditAction" AS ENUM ('created', 'edited', 'canceled');

-- CreateEnum
CREATE TYPE "ProductCode" AS ENUM ('G10', 'G15', 'G45', 'G15_AUTO');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('combustible', 'peaje', 'comida', 'mantenimiento', 'varios');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'chofer');

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "clientGeneratedId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "SaleStatus" NOT NULL DEFAULT 'active',
    "canceledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "driverName" TEXT NOT NULL DEFAULT 'sin-chofer',
    "truckCode" TEXT,
    "total" INTEGER NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerType" "CustomerType" NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "note" TEXT,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleItem" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productCode" "ProductCode" NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleAudit" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "action" "SaleAuditAction" NOT NULL,
    "reason" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverExpense" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "driverName" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amount" INTEGER NOT NULL,
    "note" TEXT,
    "receiptRef" TEXT,

    CONSTRAINT "DriverExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAccount" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Sale_clientGeneratedId_key" ON "Sale"("clientGeneratedId");

-- CreateIndex
CREATE INDEX "Sale_createdAt_idx" ON "Sale"("createdAt");

-- CreateIndex
CREATE INDEX "Sale_driverName_createdAt_idx" ON "Sale"("driverName", "createdAt");

-- CreateIndex
CREATE INDEX "SaleItem_saleId_idx" ON "SaleItem"("saleId");

-- CreateIndex
CREATE INDEX "SaleAudit_saleId_createdAt_idx" ON "SaleAudit"("saleId", "createdAt");

-- CreateIndex
CREATE INDEX "DriverExpense_createdAt_idx" ON "DriverExpense"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserAccount_username_key" ON "UserAccount"("username");

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleAudit" ADD CONSTRAINT "SaleAudit_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
