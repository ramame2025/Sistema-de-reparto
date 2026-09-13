-- Convierte el medio de pago de un enum de Prisma a una tabla, exactamente
-- como se hizo con el catalogo de productos en `20260827200000_product_catalog_table`
-- y con las categorias de cliente en `20260909150000_customer_categories`.
--
-- La columna SIGUE LLAMANDOSE `paymentMethod`. No es pereza: ese string ya
-- esta persistido dentro de los payloads de venta encolados en los telefonos
-- de los choferes. Renombrarla invalidaria esas ventas.
--
-- Es la mas chica de las tres migraciones enum -> tabla del proyecto: `Sale`
-- es la UNICA tabla que referencia el enum, y no gana ninguna foreign key.

-- CreateEnum: a diferencia del medio de pago, la politica de comprobante SI
-- sigue siendo un enum. Sus tres valores los entiende el codigo; un cuarto
-- seria una funcionalidad nueva, no configuracion del duenio.
CREATE TYPE "ProofPolicy" AS ENUM ('none', 'optional', 'required');

-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "proofPolicy" "ProofPolicy" NOT NULL DEFAULT 'optional',
    "countsAsCash" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethod_code_key" ON "PaymentMethod"("code");
CREATE INDEX "PaymentMethod_isActive_sortOrder_idx" ON "PaymentMethod"("isActive", "sortOrder");

-- Los cuatro valores del enum se vuelven las primeras cuatro filas, en el
-- mismo orden en que `PAYMENT_METHODS` los mostraba, y con el `name` que la
-- app del chofer ya le mostraba al usuario (`PAYMENT_LABELS`). Nada cambia de
-- aspecto en la pantalla.
--
-- Las banderas reproducen EXACTAMENTE el comportamiento de hoy:
--
--   proofPolicy = 'none' solo para efectivo, que es el unico caso en el que
--   las tres comparaciones `!== 'efectivo'` que esta migracion viene a
--   eliminar ocultaban la seccion de comprobante.
--
--   proofPolicy = 'optional' para los otros tres: la pantalla los rotulaba
--   "opcional" y el resumen del dia igual reclamaba el comprobante faltante.
--   Ese doble comportamiento ES el estado 'optional'.
--
--   NINGUNA fila nace en 'required'. El estado existe y esta implementado,
--   pero activarlo es una decision del duenio, no un efecto colateral de esta
--   migracion.
--
--   countsAsCash = true solo para efectivo. Todavia no lo lee nadie.
INSERT INTO "PaymentMethod" ("id", "code", "name", "isActive", "sortOrder", "proofPolicy", "countsAsCash", "createdAt", "updatedAt") VALUES
  ('seed_payment_method_efectivo',      'efectivo',      'Efectivo',      true, 0, 'none',     true,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_payment_method_transferencia', 'transferencia', 'Transferencia', true, 1, 'optional', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_payment_method_qr',            'qr',            'QR',            true, 2, 'optional', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_payment_method_tarjeta',       'tarjeta',       'Tarjeta',       true, 3, 'optional', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- AlterTable: enum -> texto. El USING preserva cada valor tal cual, asi que
-- toda venta existente queda apuntando al medio de pago semilla homonimo. La
-- columna sigue siendo NULLABLE: una fila `kind = churn` no tuvo cobro.
ALTER TABLE "Sale" ALTER COLUMN "paymentMethod" TYPE TEXT USING "paymentMethod"::TEXT;

-- DropEnum: ya no lo referencia ninguna columna.
DROP TYPE "PaymentMethod";

-- `Sale."paymentMethod"` queda como TEXTO LIBRE, SIN foreign key, por las
-- mismas razones que `Sale."customerType"` en `20260909150000_customer_categories`:
-- la venta registra con que se pago en el momento de cobrar. Un
-- `ON UPDATE CASCADE` haria que renombrar un `code` reescribiera ventas ya
-- cobradas, y un `RESTRICT` impediria para siempre limpiar un medio viejo.
-- En los dos casos el pasado deja de ser inmutable.
--
-- El costo consciente de esta decision: la base NO impide un `DELETE` directo
-- de una fila de `PaymentMethod` que alguna venta este referenciando. La
-- proteccion es procedimental -- no existe endpoint de borrado, y no se
-- borra, se da de baja con `isActive` -- y no estructural.
