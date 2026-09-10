import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { PricesModule } from '../prices/prices.module';
import { ProductsModule } from '../products/products.module';
import { CustomerCategoriesModule } from '../customer-categories/customer-categories.module';

@Module({
  imports: [PricesModule, ProductsModule, CustomerCategoriesModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
