-- CreateTable
CREATE TABLE "DriverCustomerAssignment" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverCustomerAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverCustomerAssignmentEntry" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DriverCustomerAssignmentEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DriverCustomerAssignment_driverId_date_idx" ON "DriverCustomerAssignment"("driverId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DriverCustomerAssignment_driverId_date_key" ON "DriverCustomerAssignment"("driverId", "date");

-- CreateIndex
CREATE INDEX "DriverCustomerAssignmentEntry_assignmentId_idx" ON "DriverCustomerAssignmentEntry"("assignmentId");

-- CreateIndex
CREATE INDEX "DriverCustomerAssignmentEntry_customerId_idx" ON "DriverCustomerAssignmentEntry"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "DriverCustomerAssignmentEntry_assignmentId_customerId_key" ON "DriverCustomerAssignmentEntry"("assignmentId", "customerId");

-- AddForeignKey
ALTER TABLE "DriverCustomerAssignment" ADD CONSTRAINT "DriverCustomerAssignment_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverCustomerAssignmentEntry" ADD CONSTRAINT "DriverCustomerAssignmentEntry_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "DriverCustomerAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverCustomerAssignmentEntry" ADD CONSTRAINT "DriverCustomerAssignmentEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
