-- CreateTable
CREATE TABLE "LoadManifest" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "driverName" TEXT NOT NULL DEFAULT 'sin-chofer',
    "truckId" TEXT NOT NULL,
    "truckCode" TEXT,
    "photoRef" TEXT,
    "note" TEXT,

    CONSTRAINT "LoadManifest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoadManifestItem" (
    "id" TEXT NOT NULL,
    "manifestId" TEXT NOT NULL,
    "productCode" "ProductCode" NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "LoadManifestItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoadManifest_createdAt_idx" ON "LoadManifest"("createdAt");

-- CreateIndex
CREATE INDEX "LoadManifest_driverName_createdAt_idx" ON "LoadManifest"("driverName", "createdAt");

-- CreateIndex
CREATE INDEX "LoadManifest_truckId_createdAt_idx" ON "LoadManifest"("truckId", "createdAt");

-- CreateIndex
CREATE INDEX "LoadManifestItem_manifestId_idx" ON "LoadManifestItem"("manifestId");

-- CreateIndex
CREATE INDEX "Sale_truckId_createdAt_idx" ON "Sale"("truckId", "createdAt");

-- AddForeignKey
ALTER TABLE "LoadManifest" ADD CONSTRAINT "LoadManifest_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadManifestItem" ADD CONSTRAINT "LoadManifestItem_manifestId_fkey" FOREIGN KEY ("manifestId") REFERENCES "LoadManifest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
