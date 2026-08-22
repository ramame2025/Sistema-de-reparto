import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import {
  type CreateCustomerInput,
  validateCreateCustomerInput,
} from '@distribuidor/shared';
import { Roles } from '../auth/roles.decorator';
import { CustomersService } from './customers.service';

@Controller('customers')
@Roles('admin')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @Roles('admin', 'chofer')
  async listCustomers() {
    return this.customersService.listCustomers();
  }

  @Post()
  @Roles('admin', 'chofer')
  async createCustomer(@Body() input: CreateCustomerInput) {
    const errors = validateCreateCustomerInput(input);
    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Invalid customer payload', errors });
    }

    return this.customersService.createCustomer(input);
  }

  @Delete(':id')
  @HttpCode(204)
  async deactivateCustomer(@Param('id') id: string) {
    await this.customersService.deactivateCustomer(id);
  }
}
