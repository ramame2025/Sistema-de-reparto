import { Module } from '@nestjs/common';
import { DriverTruckAssignmentsModule } from '../driver-truck-assignments/driver-truck-assignments.module';
import { TrucksController } from './trucks.controller';
import { TrucksService } from './trucks.service';

@Module({
  imports: [DriverTruckAssignmentsModule],
  controllers: [TrucksController],
  providers: [TrucksService],
  exports: [TrucksService],
})
export class TrucksModule {}
