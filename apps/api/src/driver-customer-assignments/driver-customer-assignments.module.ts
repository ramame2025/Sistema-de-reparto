import { Module } from '@nestjs/common';
import { DriverCustomerAssignmentsController } from './driver-customer-assignments.controller';
import { DriverCustomerAssignmentsService } from './driver-customer-assignments.service';

@Module({
  controllers: [DriverCustomerAssignmentsController],
  providers: [DriverCustomerAssignmentsService],
  exports: [DriverCustomerAssignmentsService],
})
export class DriverCustomerAssignmentsModule {}
