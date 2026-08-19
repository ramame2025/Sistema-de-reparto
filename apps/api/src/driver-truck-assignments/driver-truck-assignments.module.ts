import { Module } from '@nestjs/common';
import { DriverTruckAssignmentsController } from './driver-truck-assignments.controller';
import { DriverTruckAssignmentsService } from './driver-truck-assignments.service';

@Module({
  controllers: [DriverTruckAssignmentsController],
  providers: [DriverTruckAssignmentsService],
  exports: [DriverTruckAssignmentsService],
})
export class DriverTruckAssignmentsModule {}
