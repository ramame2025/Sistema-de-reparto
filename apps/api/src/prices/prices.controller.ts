import { BadRequestException, Body, Controller, Get, Param, Put } from '@nestjs/common';
import {
  CUSTOMER_TYPES,
  PRODUCT_CODES,
  type CustomerType,
  type ProductCode,
  type UpdatePriceInput,
  validateUpdatePriceInput,
} from '@distribuidor/shared';
import { Roles } from '../auth/roles.decorator';
import { PricesService } from './prices.service';

@Controller('prices')
@Roles('admin')
export class PricesController {
  constructor(private readonly pricesService: PricesService) {}

  @Get()
  async listPrices() {
    return this.pricesService.listPrices();
  }

  @Get('table')
  async getPriceTable() {
    return this.pricesService.getPriceTable();
  }

  @Put(':productCode/:customerType')
  async updatePrice(
    @Param('productCode') productCode: string,
    @Param('customerType') customerType: string,
    @Body() input: UpdatePriceInput,
  ) {
    if (!PRODUCT_CODES.includes(productCode as ProductCode)) {
      throw new BadRequestException({
        message: 'Invalid productCode',
        errors: [`productCode must be one of ${PRODUCT_CODES.join(', ')}`],
      });
    }

    if (!CUSTOMER_TYPES.includes(customerType as CustomerType)) {
      throw new BadRequestException({
        message: 'Invalid customerType',
        errors: [`customerType must be one of ${CUSTOMER_TYPES.join(', ')}`],
      });
    }

    const errors = validateUpdatePriceInput(input);
    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Invalid price payload', errors });
    }

    return this.pricesService.updatePrice(
      productCode as ProductCode,
      customerType as CustomerType,
      input.amount,
    );
  }
}
