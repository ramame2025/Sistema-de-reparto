import { BadRequestException, Body, Controller, Get, Param, Put } from '@nestjs/common';
import {
  CUSTOMER_TYPES,
  type CustomerType,
  type ProductCode,
  type UpdatePriceInput,
  validateUpdatePriceInput,
} from '@distribuidor/shared';
import { Roles } from '../auth/roles.decorator';
import { ProductsService } from '../products/products.service';
import { PricesService } from './prices.service';

@Controller('prices')
@Roles('admin')
export class PricesController {
  constructor(
    private readonly pricesService: PricesService,
    private readonly productsService: ProductsService,
  ) {}

  @Get()
  async listPrices() {
    return this.pricesService.listPrices();
  }

  // El chofer lee la tabla para mostrar el total antes de cobrar; escribir
  // sigue siendo solo del admin, por el default de clase.
  @Get('table')
  @Roles('admin', 'chofer')
  async getPriceTable() {
    return this.pricesService.getPriceTable();
  }

  @Put(':productCode/:customerType')
  async updatePrice(
    @Param('productCode') productCode: string,
    @Param('customerType') customerType: string,
    @Body() input: UpdatePriceInput,
  ) {
    // Contra el catalogo real, no contra una lista fija: si no, ningun precio
    // de un producto creado por el admin se podria editar nunca.
    await this.productsService.assertProductCodesExist([productCode]);

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
