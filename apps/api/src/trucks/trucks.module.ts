import { Module } from '@nestjs/common';
import { DriverTruckAssignmentsModule } from '../driver-truck-assignments/driver-truck-assignments.module';
import { LoadManifestsModule } from '../load-manifests/load-manifests.module';
import { TrucksController } from './trucks.controller';
import { TrucksService } from './trucks.service';

@Module({
  imports: [DriverTruckAssignmentsModule, LoadManifestsModule],
  controllers: [TrucksController],
  providers: [TrucksService],
  exports: [TrucksService],
})
export class TrucksModule {}
