-- Registra QUE y CUANTO vuelve de la calle, por producto y por motivo: los
-- envases vacios que devuelve el cliente y las unidades falladas que se
-- cambian por una nueva. El booleano `containerReturned` no alcanza -- dice
-- que algo volvio, nunca cuanto ni de que.
--
-- SEPARADA de `20260915100000_sale_kind_swap` por la regla de Postgres que su
-- encabezado explica: un valor de enum recien agregado no se puede usar en la
-- misma transaccion. Esta migracion no menciona 'swap', pero mantenerlas
-- separadas es lo que deja libre agregarle despues cualquier paso que si lo
-- necesite.
--
-- TABLA PROPIA, no una columna sobre `SaleItem`. El stock del camion suma
-- TODA linea de `SaleItem` sin filtrar, asi que una unidad que ENTRA anotada
-- ahi se contaria como mercaderia que SALIO, y los numeros dejarian de cerrar
-- contra el remito de la manana sin que nada falle. Una tabla nueva no la
-- puede sumar por accidente una consulta que ya existe.
--
-- OJO CON EL NOMBRE DEL TIPO: en Postgres toda tabla crea un tipo compuesto
-- homonimo, y por eso `20260913120000_payment_methods_table` tuvo que soltar
-- el enum `PaymentMethod` antes de crear la tabla del mismo nombre.
-- `ReturnReason` no colisiona con ninguna tabla, asi que el enum y la tabla
-- pueden nacer juntos en este archivo.
--
-- SIN BACKFILL, y no se puede hacer otra cosa: hay filas historicas que dicen
-- "si, devolvio envase" y nunca se guardo cuantos ni de que producto. Ese
-- dato no se puede recuperar porque nunca se recolecto. `containerReturned`
-- se queda tal cual para esas filas.

-- CreateEnum
CREATE TYPE "ReturnReason" AS ENUM ('empty', 'faulty');

-- CreateTable
CREATE TABLE "SaleReturnItem" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" "ReturnReason" NOT NULL,

    CONSTRAINT "SaleReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SaleReturnItem_saleId_idx" ON "SaleReturnItem"("saleId");

-- AddForeignKey: Cascade contra la venta, igual que `SaleItem`. Si la fila
-- de la visita se borra, lo que volvio en ella deja de tener sentido.
ALTER TABLE "SaleReturnItem" ADD CONSTRAINT "SaleReturnItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Restrict contra el producto, igual que `SaleItem`. Un
-- producto que alguna vez volvio no se puede borrar del catalogo sin perder
-- el registro de por que volvio; se da de baja con isActive.
ALTER TABLE "SaleReturnItem" ADD CONSTRAINT "SaleReturnItem_productCode_fkey" FOREIGN KEY ("productCode") REFERENCES "Product"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
