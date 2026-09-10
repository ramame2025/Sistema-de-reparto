import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CustomerCategoriesController } from './customer-categories.controller';
import { CustomerCategoriesService } from './customer-categories.service';

@Module({
  imports: [PrismaModule],
  controllers: [CustomerCategoriesController],
  providers: [CustomerCategoriesService],
  exports: [CustomerCategoriesService],
})
export class CustomerCategoriesModule {}
