import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { LoadManifestsController } from './load-manifests.controller';
import { LoadManifestsService } from './load-manifests.service';

@Module({
  imports: [ProductsModule],
  controllers: [LoadManifestsController],
  providers: [LoadManifestsService],
  exports: [LoadManifestsService],
})
export class LoadManifestsModule {}
