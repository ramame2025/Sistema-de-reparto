-- Precios historicos. Cierra los tres caminos por los que una venta podia
-- terminar tarifada a un precio que no era el suyo.

-- 1) ProductPrice pasa a ser append-only, versionado por validFrom.
ALTER TABLE "ProductPrice" ADD COLUMN "validFrom" TIMESTAMP(3);
ALTER TABLE "ProductPrice" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Los precios sembrados rigen desde el principio del tiempo, no desde hoy: si
-- valieran desde ahora, toda venta anterior a esta migracion se quedaria sin
-- precio aplicable y no se podria retarifar nunca.
UPDATE "ProductPrice" SET "validFrom" = TIMESTAMP '1970-01-01 00:00:00' WHERE "validFrom" IS NULL;
ALTER TABLE "ProductPrice" ALTER COLUMN "validFrom" SET NOT NULL;

DROP INDEX IF EXISTS "ProductPrice_productCode_customerType_key";
CREATE UNIQUE INDEX "ProductPrice_productCode_customerType_validFrom_key"
  ON "ProductPrice"("productCode", "customerType", "validFrom");
CREATE INDEX "ProductPrice_productCode_customerType_validFrom_idx"
  ON "ProductPrice"("productCode", "customerType", "validFrom");

-- 2) Sale gana occurredAt: cuando paso la venta, no cuando entro la fila.
ALTER TABLE "Sale" ADD COLUMN "occurredAt" TIMESTAMP(3);
UPDATE "Sale" SET "occurredAt" = "createdAt" WHERE "occurredAt" IS NULL;
ALTER TABLE "Sale" ALTER COLUMN "occurredAt" SET NOT NULL;
ALTER TABLE "Sale" ALTER COLUMN "occurredAt" SET DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "Sale_occurredAt_idx" ON "Sale"("occurredAt");

-- 3) SaleItem gana unitPrice, congelado.
ALTER TABLE "SaleItem" ADD COLUMN "unitPrice" INTEGER;

-- Backfill BEST-EFFORT, y hay que ser honesto sobre por que: el precio
-- unitario nunca se guardo, asi que para las filas existentes no se puede
-- recuperar, solo reconstruir. Se reconstruye desde el precio vigente de cada
-- combinacion producto + tipo de cliente de su venta, lo que es EXACTO
-- mientras ningun precio haya cambiado todavia. La migracion verifica esa
-- premisa abajo en vez de darla por sentada.
UPDATE "SaleItem" si
SET "unitPrice" = pp."amount"
FROM "Sale" s, "ProductPrice" pp
WHERE si."saleId" = s."id"
  AND pp."productCode" = si."productCode"
  AND pp."customerType" = s."customerType";

-- Una venta churn no tiene items, asi que no deberia quedar ninguna fila sin
-- precio. Si queda, es que la premisa de arriba no se cumplia y la migracion
-- tiene que frenar en vez de inventar un numero.
DO $$
DECLARE missing INTEGER;
DECLARE versions INTEGER;
BEGIN
  SELECT COUNT(*) INTO missing FROM "SaleItem" WHERE "unitPrice" IS NULL;
  IF missing > 0 THEN
    RAISE EXCEPTION 'No se pudo reconstruir unitPrice para % filas de SaleItem', missing;
  END IF;

  -- Si alguna combinacion ya tenia mas de una version de precio, el backfill
  -- de arriba habria sido ambiguo y posiblemente incorrecto.
  SELECT COUNT(*) INTO versions FROM (
    SELECT "productCode", "customerType" FROM "ProductPrice"
    GROUP BY 1, 2 HAVING COUNT(*) > 1
  ) t;
  IF versions > 0 THEN
    RAISE EXCEPTION 'Habia % combinaciones con mas de un precio: el backfill de unitPrice seria ambiguo', versions;
  END IF;
END $$;

ALTER TABLE "SaleItem" ALTER COLUMN "unitPrice" SET NOT NULL;
