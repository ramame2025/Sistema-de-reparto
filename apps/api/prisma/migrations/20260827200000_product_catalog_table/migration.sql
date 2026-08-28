-- Convierte el catalogo de productos de un enum de Prisma a una tabla que el
-- admin puede editar. `productCode` sigue siendo la clave que viaja por la API
-- y que ya esta persistida en las colas offline de los telefonos, asi que las
-- tres tablas que la referencian conservan la columna: solo cambia de enum a
-- texto y gana una FK. Ningun payload existente deja de ser valido.

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");
CREATE INDEX "Product_isActive_sortOrder_idx" ON "Product"("isActive", "sortOrder");

-- Los cuatro valores del enum se vuelven las primeras cuatro filas, en el
-- mismo orden en que PRODUCT_CODES los mostraba. `name` arranca igual al
-- codigo a proposito: el nombre comercial lo pone el admin, y adivinarlo aca
-- pondria una etiqueta inventada delante del chofer.
INSERT INTO "Product" ("id", "code", "name", "isActive", "sortOrder", "createdAt", "updatedAt") VALUES
  ('seed_product_g10', 'G10', 'G10', true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_product_g15', 'G15', 'G15', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_product_g45', 'G45', 'G45', true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_product_g15_auto', 'G15_AUTO', 'G15_AUTO', true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- AlterTable: enum -> texto. El USING preserva cada valor tal cual.
ALTER TABLE "SaleItem" ALTER COLUMN "productCode" TYPE TEXT USING "productCode"::TEXT;
ALTER TABLE "LoadManifestItem" ALTER COLUMN "productCode" TYPE TEXT USING "productCode"::TEXT;
ALTER TABLE "ProductPrice" ALTER COLUMN "productCode" TYPE TEXT USING "productCode"::TEXT;

-- DropEnum: ya no lo referencia ninguna columna.
DROP TYPE "ProductCode";

-- CreateIndex
CREATE INDEX "SaleItem_productCode_idx" ON "SaleItem"("productCode");
CREATE INDEX "LoadManifestItem_productCode_idx" ON "LoadManifestItem"("productCode");

-- AddForeignKey: RESTRICT, nunca CASCADE. Un producto que aparecio alguna vez
-- en una venta o un remito no se puede borrar; se da de baja con isActive.
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_productCode_fkey"
  FOREIGN KEY ("productCode") REFERENCES "Product"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LoadManifestItem" ADD CONSTRAINT "LoadManifestItem_productCode_fkey"
  FOREIGN KEY ("productCode") REFERENCES "Product"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_productCode_fkey"
  FOREIGN KEY ("productCode") REFERENCES "Product"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
