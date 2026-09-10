import { BadRequestException, Body, Controller, Get, Param, Put } from '@nestjs/common';
import {
  type CustomerType,
  type ProductCode,
  type UpdatePriceInput,
  validateUpdatePriceInput,
} from '@distribuidor/shared';
import { Roles } from '../auth/roles.decorator';
import { CustomerCategoriesService } from '../customer-categories/customer-categories.service';
import { ProductsService } from '../products/products.service';
import { PricesService } from './prices.service';

@Controller('prices')
@Roles('admin')
export class PricesController {
  constructor(
    private readonly pricesService: PricesService,
    private readonly productsService: ProductsService,
    private readonly categoriesService: CustomerCategoriesService,
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
    // Contra los catalogos reales, no contra listas fijas: si no, ningun
    // precio de un producto ni de una categoria creados por el admin se
    // podrian editar nunca.
    await this.productsService.assertProductCodesExist([productCode]);
    // Existencia, no vigencia: cargarle el precio a una categoria dada de baja
    // es inofensivo, y es justo lo que hace falta para poder reactivarla ya
    // completa.
    await this.categoriesService.assertCategoryCodesExist([customerType]);

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
