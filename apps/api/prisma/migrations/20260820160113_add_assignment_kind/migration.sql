-- CreateEnum
CREATE TYPE "AssignmentKind" AS ENUM ('titular', 'cobertura');

-- AlterTable
ALTER TABLE "DriverTruckAssignment" ADD COLUMN     "kind" "AssignmentKind" NOT NULL DEFAULT 'titular';

-- CreateIndex
CREATE INDEX "DriverTruckAssignment_truckId_kind_startDate_idx" ON "DriverTruckAssignment"("truckId", "kind", "startDate");
