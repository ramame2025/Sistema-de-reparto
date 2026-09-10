import { Module } from '@nestjs/common';
import { CustomerCategoriesModule } from '../customer-categories/customer-categories.module';
import { ProductsModule } from '../products/products.module';
import { PricesController } from './prices.controller';
import { PricesService } from './prices.service';

@Module({
  imports: [ProductsModule, CustomerCategoriesModule],
  controllers: [PricesController],
  providers: [PricesService],
  exports: [PricesService],
})
export class PricesModule {}
