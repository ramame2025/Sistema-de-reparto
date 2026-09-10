import { Module } from '@nestjs/common';
import { CustomerCategoriesModule } from '../customer-categories/customer-categories.module';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  imports: [CustomerCategoriesModule],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
