import { BadRequestException } from '@nestjs/common';
import { ROLES_KEY } from '../auth/roles.decorator';
import { CustomerCategoriesController } from './customer-categories.controller';
import type { CustomerCategoriesService } from './customer-categories.service';

describe('CustomerCategoriesController role metadata', () => {
  it('lets both roles read the category list (GET /customer-categories)', () => {
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      CustomerCategoriesController.prototype.listCategories,
    );
    expect(roles).toEqual(['admin', 'chofer']);
  });

  // Quien define las categorias es el admin: las escrituras heredan el default
  // admin-only de la clase.
  it('leaves createCategory admin-only via the class-level default', () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        CustomerCategoriesController.prototype.createCategory,
      ),
    ).toBeUndefined();
  });

  it('leaves updateCategory admin-only via the class-level default', () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        CustomerCategoriesController.prototype.updateCategory,
      ),
    ).toBeUndefined();
  });

  it('keeps the class default at admin', () => {
    expect(Reflect.getMetadata(ROLES_KEY, CustomerCategoriesController)).toEqual([
      'admin',
    ]);
  });
});

describe('CustomerCategoriesController behaviour', () => {
  let controller: CustomerCategoriesController;
  let service: {
    listCategories: jest.Mock;
    createCategory: jest.Mock;
    updateCategory: jest.Mock;
  };

  beforeEach(() => {
    service = {
      listCategories: jest.fn().mockResolvedValue([]),
      createCategory: jest.fn().mockResolvedValue({}),
      updateCategory: jest.fn().mockResolvedValue({}),
    };
    controller = new CustomerCategoriesController(
      service as unknown as CustomerCategoriesService,
    );
  });

  describe('listCategories', () => {
    it('hides inactive categories from a driver, whatever the query says', async () => {
      await controller.listCategories('true', { user: { role: 'chofer' } } as never);

      expect(service.listCategories).toHaveBeenCalledWith({ includeInactive: false });
    });

    it('lets an admin ask for the full list', async () => {
      await controller.listCategories('true', { user: { role: 'admin' } } as never);

      expect(service.listCategories).toHaveBeenCalledWith({ includeInactive: true });
    });

    it('returns only active categories to an admin by default', async () => {
      await controller.listCategories(undefined, { user: { role: 'admin' } } as never);

      expect(service.listCategories).toHaveBeenCalledWith({ includeInactive: false });
    });
  });

  describe('createCategory', () => {
    const valid = { code: 'mayorista', name: 'Mayorista' };

    it('forwards a valid payload', async () => {
      await controller.createCategory(valid);
      expect(service.createCategory).toHaveBeenCalledWith(valid);
    });

    it('rejects a malformed code before reaching the service', async () => {
      await expect(
        controller.createCategory({ ...valid, code: 'may orista' }),
      ).rejects.toThrow(BadRequestException);
      expect(service.createCategory).not.toHaveBeenCalled();
    });
  });

  describe('updateCategory', () => {
    it('rejects an empty patch before reaching the service', async () => {
      await expect(controller.updateCategory('c1', {})).rejects.toThrow(
        BadRequestException,
      );
      expect(service.updateCategory).not.toHaveBeenCalled();
    });

    it('forwards a valid patch', async () => {
      await controller.updateCategory('c1', { isActive: false });
      expect(service.updateCategory).toHaveBeenCalledWith('c1', { isActive: false });
    });
  });
});
