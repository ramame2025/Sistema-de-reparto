import { BadRequestException } from '@nestjs/common';
import { ROLES_KEY } from '../auth/roles.decorator';
import { ProductsController } from './products.controller';
import type { ProductsService } from './products.service';

describe('ProductsController role metadata', () => {
  it('lets both roles read the catalogue (GET /products)', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, ProductsController.prototype.listProducts);
    expect(roles).toEqual(['admin', 'chofer']);
  });

  // Only the admin defines what is sold and at what price -- the whole point
  // of the change. Writes inherit the admin-only class default.
  it('leaves createProduct admin-only via the class-level default', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, ProductsController.prototype.createProduct),
    ).toBeUndefined();
  });

  it('leaves updateProduct admin-only via the class-level default', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, ProductsController.prototype.updateProduct),
    ).toBeUndefined();
  });

  it('keeps the class default at admin', () => {
    expect(Reflect.getMetadata(ROLES_KEY, ProductsController)).toEqual(['admin']);
  });
});

describe('ProductsController behaviour', () => {
  let controller: ProductsController;
  let service: {
    listProducts: jest.Mock;
    createProduct: jest.Mock;
    updateProduct: jest.Mock;
  };

  beforeEach(() => {
    service = {
      listProducts: jest.fn().mockResolvedValue([]),
      createProduct: jest.fn().mockResolvedValue({}),
      updateProduct: jest.fn().mockResolvedValue({}),
    };
    controller = new ProductsController(service as unknown as ProductsService);
  });

  describe('listProducts', () => {
    it('hides inactive products from a driver, whatever the query says', async () => {
      await controller.listProducts('true', { user: { role: 'chofer' } } as never);

      expect(service.listProducts).toHaveBeenCalledWith({ includeInactive: false });
    });

    it('lets an admin ask for the full catalogue', async () => {
      await controller.listProducts('true', { user: { role: 'admin' } } as never);

      expect(service.listProducts).toHaveBeenCalledWith({ includeInactive: true });
    });

    it('returns only active products to an admin by default', async () => {
      await controller.listProducts(undefined, { user: { role: 'admin' } } as never);

      expect(service.listProducts).toHaveBeenCalledWith({ includeInactive: false });
    });
  });

  describe('createProduct', () => {
    const valid = {
      code: 'G20',
      name: 'Garrafa 20kg',
      prices: { final: 15000, comercio: 14500, distribuidor: 14000 },
    };

    it('forwards a valid payload', async () => {
      await controller.createProduct(valid);
      expect(service.createProduct).toHaveBeenCalledWith(valid);
    });

    it('rejects a product with a missing price before reaching the service', async () => {
      await expect(
        controller.createProduct({
          ...valid,
          prices: { final: 15000, comercio: 14500 } as typeof valid.prices,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(service.createProduct).not.toHaveBeenCalled();
    });

    it('rejects a malformed code before reaching the service', async () => {
      await expect(
        controller.createProduct({ ...valid, code: 'g 20' }),
      ).rejects.toThrow(BadRequestException);
      expect(service.createProduct).not.toHaveBeenCalled();
    });
  });

  describe('updateProduct', () => {
    it('rejects an empty patch before reaching the service', async () => {
      await expect(controller.updateProduct('p1', {})).rejects.toThrow(
        BadRequestException,
      );
      expect(service.updateProduct).not.toHaveBeenCalled();
    });

    it('forwards a valid patch', async () => {
      await controller.updateProduct('p1', { isActive: false });
      expect(service.updateProduct).toHaveBeenCalledWith('p1', { isActive: false });
    });
  });
});
