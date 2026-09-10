-- La capacidad del camion pasa de ser un total unico a una grilla por
-- producto. `Truck.capacity` era un solo entero: decia CUANTO entra, nunca QUE
-- entra, que es la pregunta que el duenio necesita contestada.
--
-- La capacidad sigue siendo INFORMATIVA. Nada valida un remito contra esta
-- tabla, igual que nada lo validaba contra la columna vieja; hacerla
-- vinculante es una decision aparte y no se toma aca.

-- CreateTable
CREATE TABLE "TruckCapacity" (
    "id" TEXT NOT NULL,
    "truckId" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "units" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TruckCapacity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TruckCapacity_truckId_productCode_key" ON "TruckCapacity"("truckId", "productCode");
CREATE INDEX "TruckCapacity_truckId_idx" ON "TruckCapacity"("truckId");

-- AddForeignKey: CASCADE en el camion, RESTRICT en el producto. No es una
-- inconsistencia, son dos preguntas distintas. La capacidad es una propiedad
-- DEL camion y no significa nada sin el, asi que se va con el. El producto, en
-- cambio, sigue la regla de todo el schema: si algo lo referencia no se borra
-- nunca, se da de baja con isActive.
ALTER TABLE "TruckCapacity" ADD CONSTRAINT "TruckCapacity_truckId_fkey"
  FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TruckCapacity" ADD CONSTRAINT "TruckCapacity_productCode_fkey"
  FOREIGN KEY ("productCode") REFERENCES "Product"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ESTA TABLA NACE VACIA, Y ES LA DECISION MAS IMPORTANTE DE LA MIGRACION.
--
-- El total guardado en `Truck.capacity` SE DESCARTA. No se conserva ni se
-- reparte, porque un solo numero no se puede dividir entre N productos sin
-- inventar el reparto: cualquier `units` que sembraramos aca seria un dato que
-- nadie cargo nunca, con la misma cara que uno real.
--
-- Tampoco se siembra una fila por producto en 0. Sin filas, el camion lee
-- "sin detallar", que es la verdad. Con filas en 0 leeria "no entra nada", que
-- es una afirmacion falsa sobre un camion que si carga.
--
-- El duenio acepto volver a cargar la capacidad una vez por camion.
--
-- DropColumn
ALTER TABLE "Truck" DROP COLUMN "capacity";
