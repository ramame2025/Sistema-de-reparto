import { Module } from '@nestjs/common';
import { LoadManifestsController } from './load-manifests.controller';
import { LoadManifestsService } from './load-manifests.service';

@Module({
  controllers: [LoadManifestsController],
  providers: [LoadManifestsService],
  exports: [LoadManifestsService],
})
export class LoadManifestsModule {}
