import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  type CancelSaleInput,
  type CreateSaleInput,
  type UpdateSaleInput,
  validateCancelSaleInput,
  validateCreateSaleInput,
  validateUpdateSaleInput,
} from '@distribuidor/shared';
import { SalesService } from './sales.service';
import { Roles } from '../auth/roles.decorator';

@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Roles('admin')
  @Get()
  async listSales() {
    return this.salesService.listSales();
  }

  @Roles('admin', 'chofer')
  @Post()
  async createSale(@Body() input: CreateSaleInput) {
    const errors = validateCreateSaleInput(input);

    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Invalid sale payload', errors });
    }

    return this.salesService.createSale(input);
  }

  @Roles('admin', 'chofer')
  @Patch(':id')
  async updateSale(@Param('id') id: string, @Body() input: UpdateSaleInput) {
    const errors = validateUpdateSaleInput(input);

    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Invalid update payload', errors });
    }

    return this.salesService.updateSale(id, input);
  }

  @Roles('admin')
  @Patch(':id/cancel')
  async cancelSale(@Param('id') id: string, @Body() input: CancelSaleInput) {
    const errors = validateCancelSaleInput(input);

    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Invalid cancel payload', errors });
    }

    return this.salesService.cancelSale(id, input);
  }

  @Roles('admin')
  @Get(':id/audits')
  async listSaleAudits(@Param('id') id: string) {
    return this.salesService.listSaleAudits(id);
  }
}
