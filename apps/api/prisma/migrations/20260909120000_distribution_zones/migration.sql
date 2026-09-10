-- Convierte la zona de reparto de texto libre en `Customer.zone` a una tabla
-- que el admin administra. Hasta ahora dos clientes compartian zona solo si
-- sus cadenas normalizaban igual, asi que una cuarta grafia de "Centro"
-- forkeaba la zona sin que nadie se enterara. Con la FK eso deja de poder
-- pasar: la zona es una fila, no una coincidencia de strings.
--
-- `Customer.zone` NO se elimina aca. Queda como columna sombra -- el servidor
-- le escribe el nombre de la zona resuelta -- para que nada de lo que ya esta
-- en vuelo se rompa. Se elimina en la fase 4.

-- CreateTable
CREATE TABLE "Zone" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Zone_code_key" ON "Zone"("code");
CREATE INDEX "Zone_isActive_sortOrder_idx" ON "Zone"("isActive", "sortOrder");

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "zoneId" TEXT;

-- CreateIndex
CREATE INDEX "Customer_zoneId_idx" ON "Customer"("zoneId");

-- Las filas semilla no se pueden escribir a mano: dependen de lo que cada
-- base ya tenga cargado. Se deriva una zona por cada valor distinto de
-- `Customer.zone`, deduplicado con la MISMA regla que usaba el codigo para
-- detectar duplicados (trim + minusculas), asi que la migracion no fusiona ni
-- separa nada que el sistema no tratara ya como la misma zona.
WITH distinct_zones AS (
    -- De todas las grafias que normalizan igual se conserva UNA como nombre
    -- para mostrar. El ORDER BY la vuelve deterministica: la primera
    -- alfabeticamente, no la que la base devuelva primero.
    SELECT DISTINCT ON (lower(trim("zone")))
        lower(trim("zone")) AS normalized,
        trim("zone")        AS display
    FROM "Customer"
    WHERE "zone" IS NOT NULL AND trim("zone") <> ''
    ORDER BY lower(trim("zone")), trim("zone")
),
slugged AS (
    -- El codigo es la clave estable e inmutable de la zona, con la misma
    -- forma que el de producto: mayusculas, digitos y guion bajo. Los acentos
    -- se pliegan con translate() y no con unaccent(), que es una extension
    -- que esta base no tiene por que tener instalada.
    SELECT
        normalized,
        display,
        COALESCE(
            NULLIF(
                trim(BOTH '_' FROM upper(regexp_replace(
                    translate(
                        display,
                        'áéíóúüñÁÉÍÓÚÜÑàèìòùÀÈÌÒÙâêîôûÂÊÎÔÛäëïöÄËÏÖçÇ',
                        'aeiouunAEIOUUNaeiouAEIOUaeiouAEIOUaeioAEIOcC'
                    ),
                    '[^A-Za-z0-9]+', '_', 'g'
                ))),
                ''
            ),
            -- Un nombre sin una sola letra ni digito ("---") no deja slug.
            -- Vale mas una zona con codigo generico que una migracion caida.
            'ZONA'
        ) AS base_code
    FROM distinct_zones
),
numbered AS (
    -- Dos nombres distintos pueden dar el mismo slug ("Zona 1" y "Zona-1"):
    -- son zonas distintas para el sistema actual, asi que se conservan las
    -- dos y se desempata el codigo con un sufijo, en vez de perder una fila
    -- contra el indice unico.
    SELECT
        normalized,
        display,
        base_code,
        row_number() OVER (PARTITION BY base_code ORDER BY normalized) AS collision,
        row_number() OVER (ORDER BY normalized) - 1                    AS sort_position
    FROM slugged
)
INSERT INTO "Zone" ("id", "code", "name", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT
    'seed_zone_' || lower(base_code) || CASE WHEN collision > 1 THEN '_' || collision ELSE '' END,
    base_code || CASE WHEN collision > 1 THEN '_' || collision ELSE '' END,
    display,
    true,
    sort_position,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM numbered;

-- Backfill. La columna sombra se reescribe con el nombre canonico de la zona
-- a proposito: mientras las dos convivan tienen que decir lo mismo, o el
-- texto libre viejo ("centro ") contradice a la FK en cuanto alguien lo lea.
UPDATE "Customer" AS c
SET "zoneId" = z."id",
    "zone"   = z."name"
FROM "Zone" AS z
WHERE c."zone" IS NOT NULL
  AND trim(c."zone") <> ''
  AND lower(trim(z."name")) = lower(trim(c."zone"));

-- AddForeignKey: RESTRICT, nunca CASCADE. Una zona que algun cliente
-- referencia no se puede borrar; se da de baja con isActive, igual que un
-- producto que ya se vendio alguna vez.
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_zoneId_fkey"
  FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
