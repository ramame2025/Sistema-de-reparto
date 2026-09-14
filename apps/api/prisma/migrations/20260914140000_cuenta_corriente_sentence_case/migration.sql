-- Corrige la capitalizacion del nombre visible de `cuenta_corriente`.
--
-- La fila nacio como 'Cuenta Corriente' en `20260914100000_payment_method_creates_debt`.
-- En castellano "cuenta corriente" es un nombre comun, no un nombre propio:
-- el title case es un anglicismo. Se nota sobre todo porque el nombre se
-- interpola en un mensaje al chofer, y a mitad de oracion leia
-- "Cuenta Corriente queda como deuda del cliente".
--
-- Va en una migracion NUEVA y no editando la anterior, aunque la anterior
-- solo se haya aplicado en bases de desarrollo. Una migracion aplicada es
-- historia: editarla deja a cada base en un estado distinto segun cuando la
-- corrio, y el registro de migraciones deja de describir lo que realmente
-- paso. Son append-only.
--
-- Solo toca `name`, que es el texto que se le muestra al usuario. El `code`
-- es la clave inmutable que viaja por la red y esta persistida en los
-- payloads de venta encolados en los telefonos: ese NO se toca nunca.
UPDATE "PaymentMethod"
SET "name" = 'Cuenta corriente', "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'cuenta_corriente' AND "name" <> 'Cuenta corriente';
