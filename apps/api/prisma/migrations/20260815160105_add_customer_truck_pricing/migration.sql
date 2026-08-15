-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "truckId" TEXT;

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "customerType" "CustomerType" NOT NULL,
    "zone" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Truck" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Truck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverTruckAssignment" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "truckId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverTruckAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductPrice" (
    "id" TEXT NOT NULL,
    "productCode" "ProductCode" NOT NULL,
    "customerType" "CustomerType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Customer_isActive_name_idx" ON "Customer"("isActive", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Truck_code_key" ON "Truck"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Truck_plate_key" ON "Truck"("plate");

-- CreateIndex
CREATE INDEX "Truck_isActive_code_idx" ON "Truck"("isActive", "code");

-- CreateIndex
CREATE INDEX "DriverTruckAssignment_truckId_startDate_idx" ON "DriverTruckAssignment"("truckId", "startDate");

-- CreateIndex
CREATE INDEX "DriverTruckAssignment_driverId_startDate_idx" ON "DriverTruckAssignment"("driverId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "ProductPrice_productCode_customerType_key" ON "ProductPrice"("productCode", "customerType");

-- CreateIndex
CREATE INDEX "Sale_customerId_idx" ON "Sale"("customerId");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverTruckAssignment" ADD CONSTRAINT "DriverTruckAssignment_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverTruckAssignment" ADD CONSTRAINT "DriverTruckAssignment_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SeedData: mirrors DEFAULT_PRICE_TABLE from packages/shared/src/domain.ts
INSERT INTO "ProductPrice" ("id", "productCode", "customerType", "amount", "updatedAt") VALUES
  ('seed_price_final_g10', 'G10', 'final', 8500, CURRENT_TIMESTAMP),
  ('seed_price_final_g15', 'G15', 'final', 13000, CURRENT_TIMESTAMP),
  ('seed_price_final_g45', 'G45', 'final', 39000, CURRENT_TIMESTAMP),
  ('seed_price_final_g15_auto', 'G15_AUTO', 'final', 14500, CURRENT_TIMESTAMP),
  ('seed_price_comercio_g10', 'G10', 'comercio', 8200, CURRENT_TIMESTAMP),
  ('seed_price_comercio_g15', 'G15', 'comercio', 12600, CURRENT_TIMESTAMP),
  ('seed_price_comercio_g45', 'G45', 'comercio', 38000, CURRENT_TIMESTAMP),
  ('seed_price_comercio_g15_auto', 'G15_AUTO', 'comercio', 14000, CURRENT_TIMESTAMP),
  ('seed_price_distribuidor_g10', 'G10', 'distribuidor', 7900, CURRENT_TIMESTAMP),
  ('seed_price_distribuidor_g15', 'G15', 'distribuidor', 12100, CURRENT_TIMESTAMP),
  ('seed_price_distribuidor_g45', 'G45', 'distribuidor', 36500, CURRENT_TIMESTAMP),
  ('seed_price_distribuidor_g15_auto', 'G15_AUTO', 'distribuidor', 13600, CURRENT_TIMESTAMP);
