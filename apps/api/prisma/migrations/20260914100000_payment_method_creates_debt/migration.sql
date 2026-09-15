-- Agrega la bandera `createsDebt` a los medios de pago y da de alta la cuenta
-- corriente como uno mas. La venta a cuenta corriente es una venta facturada
-- que nadie pago todavia; esta migracion solo registra ese hecho. No hay
-- modelo de cobros ni de saldos, y nada aca finge que los haya.
--
-- Son TRES banderas y tres preguntas independientes (D1 del plan):
--
--   countsAsCash  -- es plata fisica que el chofer tiene que rendir?
--   createsDebt   -- el cliente sigue debiendo esto?
--   proofPolicy   -- la venta lleva comprobante?
--
-- La transferencia es la fila que prueba que no se pueden colapsar: no es
-- plata en mano y tampoco deja deuda.
--
-- NOTA DE ORDEN, heredada de `20260913120000_payment_methods_table`: aquella
-- migracion fallo en el primer intento porque en Postgres toda tabla crea un
-- tipo compuesto homonimo, asi que un `CREATE TABLE "PaymentMethod"` choco
-- con el enum del mismo nombre (42710). Esta migracion solo agrega una
-- columna y una fila, asi que no toca esa trampa, pero la regla conviene
-- tenerla a mano cada vez que se vuelve sobre esta tabla.

-- AlterTable: el default `false` deja a los cuatro medios existentes
-- exactamente como estaban. Ninguna venta ya registrada pasa a ser deuda.
ALTER TABLE "PaymentMethod" ADD COLUMN "createsDebt" BOOLEAN NOT NULL DEFAULT false;

-- La cuenta corriente entra como una fila mas, no como una clase aparte de
-- venta: el chofer vende, elige como le pagaron, y "cuenta corriente" es una
-- opcion mas de esa lista.
--
--   proofPolicy = 'none' y esto NO es cosmetico. `dayProblems.ts` marca como
--   problema toda venta cuya politica no sea 'none' y no tenga foto del
--   comprobante. Una venta a cuenta corriente no tuvo pago, por lo tanto no
--   tiene comprobante, por lo tanto esa foto no va a llegar nunca: con
--   'optional' el resumen del dia del chofer quedaria con un reclamo eterno e
--   irresoluble. Ver decision D3 del plan.
--
--   countsAsCash = false: no entra un peso a la mano del chofer.
--
--   createsDebt = true: es la unica fila que hoy la tiene prendida, y la
--   razon por la que la columna existe.
INSERT INTO "PaymentMethod" ("id", "code", "name", "isActive", "sortOrder", "proofPolicy", "countsAsCash", "createsDebt", "createdAt", "updatedAt") VALUES
  ('seed_payment_method_cuenta_corriente', 'cuenta_corriente', 'Cuenta Corriente', true, 4, 'none', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- `Sale."customerId"` sigue siendo NULLABLE a proposito. La regla "si el
-- medio genera deuda, la venta tiene que decir quien debe" es CONDICIONAL:
-- depende de una bandera que vive en esta otra tabla, y un CHECK no llega
-- hasta ahi. La regla se aplica en `packages/shared`, que es el unico lugar
-- donde la corren tanto la API como la app del chofer, que valida offline.
--
-- El costo consciente: la base sola no impide una deuda sin deudor. La
-- garantia es el validador compartido, igual que la proteccion contra el
-- borrado de un medio de pago es procedimental y no estructural. Ver D5.
