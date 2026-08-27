import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { CreateProductInput } from '@distribuidor/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from './products.service';

type ProductRow = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

function buildProductRow(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: 'product-1',
    code: 'G20',
    name: 'Garrafa 20kg',
    isActive: true,
    sortOrder: 4,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: {
    product: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    productPrice: { createMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      product: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      productPrice: { createMany: jest.fn() },
      // The real client hands the callback a transactional prisma; the same
      // mock stands in for it, which is what lets the tests assert that the
      // product and its prices are written through one call.
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [ProductsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(ProductsService);
  });

  describe('listProducts', () => {
    it('returns only active products by default, ordered for display', async () => {
      prisma.product.findMany.mockResolvedValue([buildProductRow()]);

      await service.listProducts();

      expect(prisma.product.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      });
    });

    it('includes inactive products when asked', async () => {
      prisma.product.findMany.mockResolvedValue([]);

      await service.listProducts({ includeInactive: true });

      expect(prisma.product.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      });
    });
  });

  describe('createProduct', () => {
    const input: CreateProductInput = {
      code: 'G20',
      name: 'Garrafa 20kg',
      prices: { final: 15000, comercio: 14500, distribuidor: 14000 },
    };

    beforeEach(() => {
      prisma.product.findUnique.mockResolvedValue(null);
      prisma.product.create.mockResolvedValue(buildProductRow());
      prisma.productPrice.createMany.mockResolvedValue({ count: 3 });
    });

    it('creates the product and its three prices in ONE transaction', async () => {
      await service.createProduct(input);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.product.create).toHaveBeenCalled();
      expect(prisma.productPrice.createMany).toHaveBeenCalledWith({
        data: [
          { productCode: 'G20', customerType: 'final', amount: 15000 },
          { productCode: 'G20', customerType: 'comercio', amount: 14500 },
          { productCode: 'G20', customerType: 'distribuidor', amount: 14000 },
        ],
      });
    });

    it('normalizes the code by trimming it', async () => {
      await service.createProduct({ ...input, code: '  G20  ' });

      expect(prisma.product.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ code: 'G20' }),
      });
    });

    it('defaults sortOrder to 0 when not given', async () => {
      await service.createProduct(input);

      expect(prisma.product.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ sortOrder: 0 }),
      });
    });

    it('rejects a duplicate code with a ConflictException', async () => {
      prisma.product.findUnique.mockResolvedValue(buildProductRow());

      await expect(service.createProduct(input)).rejects.toThrow(ConflictException);
      expect(prisma.product.create).not.toHaveBeenCalled();
    });

    it('treats a deactivated product as still occupying its code', async () => {
      prisma.product.findUnique.mockResolvedValue(buildProductRow({ isActive: false }));

      await expect(service.createProduct(input)).rejects.toThrow(ConflictException);
    });
  });

  describe('updateProduct', () => {
    it('patches only the fields named', async () => {
      prisma.product.findUnique.mockResolvedValue(buildProductRow());
      prisma.product.update.mockResolvedValue(buildProductRow({ name: 'Otro' }));

      await service.updateProduct('product-1', { name: 'Otro' });

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'product-1' },
        data: { name: 'Otro' },
      });
    });

    it('deactivates without deleting, so past sales stay readable', async () => {
      prisma.product.findUnique.mockResolvedValue(buildProductRow());
      prisma.product.update.mockResolvedValue(buildProductRow({ isActive: false }));

      const result = await service.updateProduct('product-1', { isActive: false });

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'product-1' },
        data: { isActive: false },
      });
      expect(result.isActive).toBe(false);
    });

    it('can reactivate a product', async () => {
      prisma.product.findUnique.mockResolvedValue(buildProductRow({ isActive: false }));
      prisma.product.update.mockResolvedValue(buildProductRow({ isActive: true }));

      const result = await service.updateProduct('product-1', { isActive: true });

      expect(result.isActive).toBe(true);
    });

    it('throws NotFoundException for an unknown id', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(service.updateProduct('missing', { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.product.update).not.toHaveBeenCalled();
    });
  });

  describe('assertProductCodesExist', () => {
    // A deactivated product must still be accepted: a sale queued on a phone
    // before the product was hidden has to be able to sync afterwards.
    it('accepts codes of deactivated products', async () => {
      prisma.product.findMany.mockResolvedValue([
        buildProductRow({ code: 'G20', isActive: false }),
      ]);

      await expect(service.assertProductCodesExist(['G20'])).resolves.toBeUndefined();
      expect(prisma.product.findMany).toHaveBeenCalledWith({
        where: { code: { in: ['G20'] } },
        select: { code: true },
      });
    });

    it('rejects a code that is not in the catalogue', async () => {
      prisma.product.findMany.mockResolvedValue([buildProductRow({ code: 'G20' })]);

      await expect(service.assertProductCodesExist(['G20', 'G99'])).rejects.toThrow(
        /G99/,
      );
    });

    it('does not query when there is nothing to check', async () => {
      await service.assertProductCodesExist([]);

      expect(prisma.product.findMany).not.toHaveBeenCalled();
    });

    it('checks each distinct code once', async () => {
      prisma.product.findMany.mockResolvedValue([buildProductRow({ code: 'G20' })]);

      await service.assertProductCodesExist(['G20', 'G20', 'G20']);

      expect(prisma.product.findMany).toHaveBeenCalledWith({
        where: { code: { in: ['G20'] } },
        select: { code: true },
      });
    });
  });
});
