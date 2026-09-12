import { Module } from '@nestjs/common';
import { DriverTruckAssignmentsModule } from '../driver-truck-assignments/driver-truck-assignments.module';
import { ProductsModule } from '../products/products.module';
import { LoadManifestsController } from './load-manifests.controller';
import { LoadManifestsService } from './load-manifests.service';

@Module({
  imports: [ProductsModule, DriverTruckAssignmentsModule],
  controllers: [LoadManifestsController],
  providers: [LoadManifestsService],
  exports: [LoadManifestsService],
})
export class LoadManifestsModule {}
