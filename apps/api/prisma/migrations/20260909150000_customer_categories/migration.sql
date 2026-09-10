-- Convierte el tipo de cliente de un enum de Prisma a una tabla que el admin
-- puede editar, exactamente como se hizo con el catalogo de productos en
-- `20260827200000_product_catalog_table`.
--
-- La columna SIGUE LLAMANDOSE `customerType` en las tres tablas. No es
-- pereza: ese string ya esta persistido dentro de los payloads de venta
-- encolados en los telefonos de los choferes, igual que `productCode`.
-- Renombrarla invalidaria esas ventas. Solo cambia el tipo (enum -> texto) y,
-- donde corresponde, gana una FK.

-- CreateTable
CREATE TABLE "CustomerCategory" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerCategory_code_key" ON "CustomerCategory"("code");
CREATE INDEX "CustomerCategory_isActive_sortOrder_idx" ON "CustomerCategory"("isActive", "sortOrder");

-- Los tres valores del enum se vuelven las primeras tres filas, en el mismo
-- orden en que CUSTOMER_TYPES los mostraba. A diferencia del seed de
-- productos, aca el `name` NO se inventa: son las etiquetas que la app del
-- chofer ya le mostraba al usuario (CUSTOMER_TYPE_LABELS), asi que nada
-- cambia de aspecto en la pantalla.
INSERT INTO "CustomerCategory" ("id", "code", "name", "isActive", "sortOrder", "createdAt", "updatedAt") VALUES
  ('seed_customer_category_final', 'final', 'Final', true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_customer_category_comercio', 'comercio', 'Comercio', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_customer_category_distribuidor', 'distribuidor', 'Distribuidor', true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- AlterTable: enum -> texto. El USING preserva cada valor tal cual, asi que
-- toda fila existente queda apuntando a la categoria semilla homonima.
ALTER TABLE "Customer" ALTER COLUMN "customerType" TYPE TEXT USING "customerType"::TEXT;
ALTER TABLE "ProductPrice" ALTER COLUMN "customerType" TYPE TEXT USING "customerType"::TEXT;
ALTER TABLE "Sale" ALTER COLUMN "customerType" TYPE TEXT USING "customerType"::TEXT;

-- DropEnum: ya no lo referencia ninguna columna.
DROP TYPE "CustomerType";

-- CreateIndex
CREATE INDEX "Customer_customerType_idx" ON "Customer"("customerType");

-- AddForeignKey: RESTRICT, nunca CASCADE en el DELETE. Una categoria que
-- algun cliente tiene asignada, o que alguna vez tuvo un precio, no se puede
-- borrar; se da de baja con isActive.
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_customerType_fkey"
  FOREIGN KEY ("customerType") REFERENCES "CustomerCategory"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_customerType_fkey"
  FOREIGN KEY ("customerType") REFERENCES "CustomerCategory"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- `Sale."customerType"` queda como TEXTO LIBRE, sin foreign key. Es la
-- decision mas importante de esta migracion, y es deliberada:
--
-- La venta registra lo que el cliente ERA en el momento de cobrarle. Una FK
-- con ON UPDATE CASCADE haria que renombrar el `code` de una categoria
-- reescribiera el historial de ventas ya cobradas; una FK con RESTRICT
-- ademas impediria para siempre limpiar una categoria vieja aunque ya no
-- quede ningun cliente usandola. En los dos casos el pasado deja de ser
-- inmutable, que es justo lo contrario de lo que una venta tiene que ser.
--
-- Es el mismo criterio con el que `SaleItem.unitPrice` congela el precio en
-- vez de leerlo de `ProductPrice`. La integridad referencial aca no vale lo
-- que cuesta: vale mas un historial que nadie puede tocar.
--
-- El unique `ProductPrice_productCode_customerType_validFrom_key` y el indice
-- `ProductPrice_productCode_customerType_validFrom_idx` sobreviven al ALTER
-- COLUMN: Postgres los reconstruye solo, y conservan la misma forma
-- `(productCode, customerType, validFrom)`. Por eso no se dropean ni se
-- vuelven a crear aca.
