import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  type CreateCustomerInput,
  type UpdateCustomerInput,
  validateCreateCustomerInput,
  validateUpdateCustomerInput,
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
  async createCustomer(
    @Body() input: CreateCustomerInput,
    // Opt-in escape hatch: without it a same-name, same-zone create answers
    // 409 carrying the existing customer, so the caller can offer it instead
    // of silently forking the sales history across two records.
    @Query('allowDuplicate') allowDuplicate?: string,
  ) {
    const errors = validateCreateCustomerInput(input);
    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Invalid customer payload', errors });
    }

    return this.customersService.createCustomer(input, {
      allowDuplicate: allowDuplicate === 'true',
    });
  }

  @Patch(':id')
  async updateCustomer(@Param('id') id: string, @Body() input: UpdateCustomerInput) {
    const errors = validateUpdateCustomerInput(input);
    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Invalid customer payload', errors });
    }

    return this.customersService.updateCustomer(id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  async deactivateCustomer(@Param('id') id: string) {
    await this.customersService.deactivateCustomer(id);
  }
}
