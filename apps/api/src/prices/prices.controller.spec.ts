import { BadRequestException } from '@nestjs/common';
import { ROLES_KEY } from '../auth/roles.decorator';
import type { CustomerCategoriesService } from '../customer-categories/customer-categories.service';
import type { ProductsService } from '../products/products.service';
import { PricesController } from './prices.controller';
import type { PricesService } from './prices.service';

describe('PricesController role metadata', () => {
  // El chofer necesita la tabla para mostrar el total antes de cobrar. Sin
  // esto la app tendria que adivinar el precio, que es exactamente el bug que
  // esta fase cierra.
  it('lets a driver read the price table (GET /prices/table)', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, PricesController.prototype.getPriceTable);
    expect(roles).toEqual(['admin', 'chofer']);
  });

  // Leer si, escribir no: solo el admin define cuanto vale lo que se vende.
  it('leaves updatePrice admin-only via the class-level default', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, PricesController.prototype.updatePrice),
    ).toBeUndefined();
  });

  it('leaves listPrices admin-only via the class-level default', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, PricesController.prototype.listPrices),
    ).toBeUndefined();
  });

  it('keeps the class default at admin', () => {
    expect(Reflect.getMetadata(ROLES_KEY, PricesController)).toEqual(['admin']);
  });
});

describe('PricesController updatePrice', () => {
  let controller: PricesController;
  let pricesService: { updatePrice: jest.Mock };
  let productsService: { assertProductCodesExist: jest.Mock };
  let categoriesService: { assertCategoryCodesExist: jest.Mock };

  beforeEach(() => {
    pricesService = { updatePrice: jest.fn().mockResolvedValue({}) };
    productsService = { assertProductCodesExist: jest.fn().mockResolvedValue(undefined) };
    categoriesService = {
      assertCategoryCodesExist: jest.fn().mockResolvedValue(undefined),
    };
    controller = new PricesController(
      pricesService as unknown as PricesService,
      productsService as unknown as ProductsService,
      categoriesService as unknown as CustomerCategoriesService,
    );
  });

  // Contra la tabla real, no contra una lista fija: si no, ningun precio de
  // una categoria creada por el admin se podria editar nunca.
  it('checks the customerType against the categories table', async () => {
    await controller.updatePrice('G10', 'mayorista', { amount: 7000 });

    expect(categoriesService.assertCategoryCodesExist).toHaveBeenCalledWith([
      'mayorista',
    ]);
    expect(pricesService.updatePrice).toHaveBeenCalledWith('G10', 'mayorista', 7000);
  });

  it('lets the categories table reject an unknown customerType', async () => {
    categoriesService.assertCategoryCodesExist.mockRejectedValue(
      new BadRequestException('Unknown customerType: fantasma'),
    );

    await expect(
      controller.updatePrice('G10', 'fantasma', { amount: 7000 }),
    ).rejects.toThrow(BadRequestException);
    expect(pricesService.updatePrice).not.toHaveBeenCalled();
  });

  it('rejects an invalid amount before writing anything', async () => {
    await expect(
      controller.updatePrice('G10', 'final', { amount: 0 }),
    ).rejects.toThrow(BadRequestException);
    expect(pricesService.updatePrice).not.toHaveBeenCalled();
  });
});
