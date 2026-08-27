import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { PricesService } from './prices.service';

type PriceRow = {
  id: string;
  productCode: 'G10' | 'G15' | 'G45' | 'G15_AUTO';
  customerType: 'final' | 'comercio' | 'distribuidor';
  amount: number;
  updatedAt: Date;
};

const ALL_PRODUCT_CODES: PriceRow['productCode'][] = [
  'G10',
  'G15',
  'G45',
  'G15_AUTO',
];
const ALL_CUSTOMER_TYPES: PriceRow['customerType'][] = [
  'final',
  'comercio',
  'distribuidor',
];

function buildFullPriceRows(): PriceRow[] {
  const rows: PriceRow[] = [];
  let amount = 1000;
  for (const customerType of ALL_CUSTOMER_TYPES) {
    for (const productCode of ALL_PRODUCT_CODES) {
      rows.push({
        id: `price-${customerType}-${productCode}`,
        productCode,
        customerType,
        amount,
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      amount += 100;
    }
  }
  return rows;
}

describe('PricesService', () => {
  let service: PricesService;
  let prisma: {
    productPrice: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    product: {
      findMany: jest.Mock;
    };
    sale: {
      findMany: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      product: {
        findMany: jest.fn(),
      },
      productPrice: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      sale: {
        findMany: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [PricesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(PricesService);
    // El catalogo ya no es una constante: la tabla de precios se arma a partir
    // de los productos que existen en la base.
    prisma.product.findMany.mockResolvedValue(
      ALL_PRODUCT_CODES.map((code) => ({ code })),
    );
  });

  describe('getPriceTable', () => {
    it('throws when one of the 12 productCode x customerType pairs is missing', async () => {
      const rows = buildFullPriceRows().filter(
        (row) => !(row.productCode === 'G45' && row.customerType === 'distribuidor'),
      );
      prisma.productPrice.findMany.mockResolvedValue(rows);

      await expect(service.getPriceTable()).rejects.toThrow(
        /G45.*distribuidor|distribuidor.*G45/,
      );
    });

    it('throws a different message when a different pair is missing', async () => {
      const rows = buildFullPriceRows().filter(
        (row) => !(row.productCode === 'G10' && row.customerType === 'final'),
      );
      prisma.productPrice.findMany.mockResolvedValue(rows);

      await expect(service.getPriceTable()).rejects.toThrow(
        /G10.*final|final.*G10/,
      );
    });

    it('maps all 12 rows into the PriceTable shape keyed by customerType then productCode', async () => {
      const rows = buildFullPriceRows();
      prisma.productPrice.findMany.mockResolvedValue(rows);

      const table = await service.getPriceTable();

      expect(table.final.G10).toBe(1000);
      expect(table.final.G15).toBe(1100);
      expect(table.final.G45).toBe(1200);
      expect(table.final.G15_AUTO).toBe(1300);
      expect(table.comercio.G10).toBe(1400);
      expect(table.distribuidor.G15_AUTO).toBe(2100);
    });

    it('covers a product added after the seed, without any code change', async () => {
      prisma.product.findMany.mockResolvedValue(
        [...ALL_PRODUCT_CODES, 'G20'].map((code) => ({ code })),
      );
      prisma.productPrice.findMany.mockResolvedValue([
        ...buildFullPriceRows(),
        ...ALL_CUSTOMER_TYPES.map((customerType) => ({
          id: `price-${customerType}-G20`,
          productCode: 'G20' as PriceRow['productCode'],
          customerType,
          amount: 5000,
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        })),
      ]);

      const table = await service.getPriceTable();

      expect(table.final.G20).toBe(5000);
      expect(table.distribuidor.G20).toBe(5000);
    });

    // Una venta encolada en el telefono antes de dar de baja el producto tiene
    // que poder sincronizar despues, y para eso necesita su precio.
    it('keeps deactivated products in the table, so queued sales can still be priced', async () => {
      prisma.productPrice.findMany.mockResolvedValue(buildFullPriceRows());

      await service.getPriceTable();

      expect(prisma.product.findMany).toHaveBeenCalledWith({
        select: { code: true },
      });
    });

    it('does not throw for a catalogue with no products at all', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.productPrice.findMany.mockResolvedValue([]);

      await expect(service.getPriceTable()).resolves.toEqual({
        final: {},
        comercio: {},
        distribuidor: {},
      });
    });
  });

  describe('updatePrice', () => {
    it('mutates a single existing row via update, without creating a new one', async () => {
      const existing = buildFullPriceRows()[0];
      prisma.productPrice.findUnique.mockResolvedValue(existing);
      prisma.productPrice.update.mockResolvedValue({
        ...existing,
        amount: 9999,
      });

      const result = await service.updatePrice('G10', 'final', 9999);

      expect(prisma.productPrice.update).toHaveBeenCalledWith({
        where: { productCode_customerType: { productCode: 'G10', customerType: 'final' } },
        data: { amount: 9999 },
      });
      expect(result.amount).toBe(9999);
    });

    it('never touches the Sale table when updating a price', async () => {
      const existing = buildFullPriceRows()[0];
      prisma.productPrice.findUnique.mockResolvedValue(existing);
      prisma.productPrice.update.mockResolvedValue({
        ...existing,
        amount: 5000,
      });

      await service.updatePrice('G10', 'final', 5000);

      expect(prisma.sale.findMany).not.toHaveBeenCalled();
      expect(prisma.sale.update).not.toHaveBeenCalled();
      expect(prisma.sale.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the productCode/customerType pair does not exist', async () => {
      prisma.productPrice.findUnique.mockResolvedValue(null);

      await expect(
        service.updatePrice('G45', 'distribuidor', 5000),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.productPrice.update).not.toHaveBeenCalled();
    });
  });
});
