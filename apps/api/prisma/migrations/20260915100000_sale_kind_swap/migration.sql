-- Agrega el tercer `kind` de venta: `swap`, el cambio de envase por falla.
-- Entrega mercaderia del camion y no cobra un peso.
--
-- SOLA EN SU ARCHIVO, y no es cosmetico. Postgres no deja USAR un valor de
-- enum en la misma transaccion que lo agrega, y Prisma corre cada migracion
-- dentro de una. Todo lo que quiera insertar, comparar o poner por default un
-- 'swap' tiene que esperar a la migracion siguiente.
--
-- Sin backfill: ninguna fila existente es un swap. Hasta hoy la unica forma
-- de anotar un cambio era como una venta normal, y esas filas cobraron de
-- verdad -- reinterpretarlas ahora inventaria un dato que nadie registro.

-- AlterEnum
ALTER TYPE "SaleKind" ADD VALUE 'swap';
