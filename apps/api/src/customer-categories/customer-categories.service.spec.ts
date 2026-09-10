import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { CreateCustomerCategoryInput } from '@distribuidor/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerCategoriesService } from './customer-categories.service';

type CategoryRow = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

function buildCategoryRow(overrides: Partial<CategoryRow> = {}): CategoryRow {
  return {
    id: 'category-1',
    code: 'mayorista',
    name: 'Mayorista',
    isActive: true,
    sortOrder: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('CustomerCategoriesService', () => {
  let service: CustomerCategoriesService;
  let prisma: {
    customerCategory: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      customerCategory: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CustomerCategoriesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(CustomerCategoriesService);
  });

  describe('listCategories', () => {
    it('returns only active categories by default, ordered for display', async () => {
      prisma.customerCategory.findMany.mockResolvedValue([buildCategoryRow()]);

      const result = await service.listCategories();

      expect(prisma.customerCategory.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
      expect(result[0].code).toBe('mayorista');
    });

    it('includes inactive categories when asked', async () => {
      prisma.customerCategory.findMany.mockResolvedValue([]);

      await service.listCategories({ includeInactive: true });

      expect(prisma.customerCategory.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
    });
  });

  describe('createCategory', () => {
    const input: CreateCustomerCategoryInput = {
      code: 'mayorista',
      name: 'Mayorista',
    };

    beforeEach(() => {
      prisma.customerCategory.findUnique.mockResolvedValue(null);
      prisma.customerCategory.create.mockResolvedValue(buildCategoryRow());
    });

    it('creates the category as active', async () => {
      await service.createCategory(input);

      expect(prisma.customerCategory.create).toHaveBeenCalledWith({
        data: { code: 'mayorista', name: 'Mayorista', sortOrder: 0, isActive: true },
      });
    });

    it('normalizes the code by trimming it', async () => {
      await service.createCategory({ ...input, code: '  mayorista  ' });

      expect(prisma.customerCategory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ code: 'mayorista' }),
      });
    });

    it('keeps the sortOrder the caller asked for', async () => {
      await service.createCategory({ ...input, sortOrder: 5 });

      expect(prisma.customerCategory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ sortOrder: 5 }),
      });
    });

    // Una categoria nueva NACE SIN PRECIOS a proposito: nada se copia de otra
    // categoria ni se backfillea. Un precio heredado miente en silencio; una
    // celda vacia se ve.
    it('writes no price row at all', async () => {
      await service.createCategory(input);

      expect(Object.keys(prisma)).not.toContain('productPrice');
    });

    it('rejects a duplicate code with a ConflictException', async () => {
      prisma.customerCategory.findUnique.mockResolvedValue(buildCategoryRow());

      await expect(service.createCategory(input)).rejects.toThrow(ConflictException);
      expect(prisma.customerCategory.create).not.toHaveBeenCalled();
    });

    // Una categoria dada de baja sigue ocupando su codigo: las ventas viejas y
    // los clientes que la tienen asignada la siguen referenciando, asi que
    // reusarlo mezclaria dos categorias distintas en un mismo historial.
    it('treats a deactivated category as still occupying its code', async () => {
      prisma.customerCategory.findUnique.mockResolvedValue(
        buildCategoryRow({ isActive: false }),
      );

      await expect(service.createCategory(input)).rejects.toThrow(ConflictException);
    });
  });

  describe('updateCategory', () => {
    it('patches only the fields named', async () => {
      prisma.customerCategory.findUnique.mockResolvedValue(buildCategoryRow());
      prisma.customerCategory.update.mockResolvedValue(
        buildCategoryRow({ name: 'Mayorista A' }),
      );

      await service.updateCategory('category-1', { name: 'Mayorista A' });

      expect(prisma.customerCategory.update).toHaveBeenCalledWith({
        where: { id: 'category-1' },
        data: { name: 'Mayorista A' },
      });
    });

    it('deactivates without deleting, so old sales keep their category', async () => {
      prisma.customerCategory.findUnique.mockResolvedValue(buildCategoryRow());
      prisma.customerCategory.update.mockResolvedValue(
        buildCategoryRow({ isActive: false }),
      );

      const result = await service.updateCategory('category-1', { isActive: false });

      expect(result.isActive).toBe(false);
    });

    it('reorders a category', async () => {
      prisma.customerCategory.findUnique.mockResolvedValue(buildCategoryRow());
      prisma.customerCategory.update.mockResolvedValue(
        buildCategoryRow({ sortOrder: 3 }),
      );

      const result = await service.updateCategory('category-1', { sortOrder: 3 });

      expect(result.sortOrder).toBe(3);
    });

    it('throws NotFoundException for an unknown id', async () => {
      prisma.customerCategory.findUnique.mockResolvedValue(null);

      await expect(
        service.updateCategory('missing', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.customerCategory.update).not.toHaveBeenCalled();
    });
  });

  describe('assertCategoryCodesExist', () => {
    it('accepts every code the table knows', async () => {
      prisma.customerCategory.findMany.mockResolvedValue([
        { code: 'final' },
        { code: 'mayorista' },
      ]);

      await expect(
        service.assertCategoryCodesExist(['final', 'mayorista']),
      ).resolves.toBeUndefined();
    });

    it('does not query for an empty list', async () => {
      await service.assertCategoryCodesExist([]);

      expect(prisma.customerCategory.findMany).not.toHaveBeenCalled();
    });

    it('names the offending code in the message, not only in errors', async () => {
      prisma.customerCategory.findMany.mockResolvedValue([]);

      await expect(service.assertCategoryCodesExist(['fantasma'])).rejects.toMatchObject(
        {
          response: {
            message: 'Unknown customerType: fantasma',
            errors: ['customerType fantasma does not exist'],
          },
        },
      );
    });

    // Mismo criterio que `ProductsService.assertProductCodesExist`, y por el
    // mismo motivo: ese string llega dentro de una venta encolada en el
    // telefono ANTES de que el admin diera de baja la categoria. Rechazarla
    // perderia una venta real.
    it('accepts a deactivated category, because a queued sale may carry it', async () => {
      prisma.customerCategory.findMany.mockResolvedValue([{ code: 'comercio' }]);

      await expect(
        service.assertCategoryCodesExist(['comercio']),
      ).resolves.toBeUndefined();
      expect(prisma.customerCategory.findMany).toHaveBeenCalledWith({
        where: { code: { in: ['comercio'] } },
        select: { code: true },
      });
    });
  });

  describe('assertCategoryAssignable', () => {
    it('accepts an active category', async () => {
      prisma.customerCategory.findUnique.mockResolvedValue(buildCategoryRow());

      await expect(
        service.assertCategoryAssignable('mayorista'),
      ).resolves.toBeUndefined();
    });

    it('rejects an unknown code, naming it', async () => {
      prisma.customerCategory.findUnique.mockResolvedValue(null);

      await expect(service.assertCategoryAssignable('fantasma')).rejects.toMatchObject({
        response: { message: 'Unknown customerType: fantasma' },
      });
    });

    // El opuesto exacto de `assertCategoryCodesExist`, y a proposito: asignarle
    // una categoria a un cliente es una eleccion de escritorio contra una lista
    // viva, no una venta vieja sincronizando. Una categoria dada de baja ahi es
    // un error, no una sincronizacion tardia.
    it('rejects a deactivated category', async () => {
      prisma.customerCategory.findUnique.mockResolvedValue(
        buildCategoryRow({ isActive: false }),
      );

      await expect(service.assertCategoryAssignable('mayorista')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
