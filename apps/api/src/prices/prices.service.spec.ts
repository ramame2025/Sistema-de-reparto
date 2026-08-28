import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { PricesService } from './prices.service';

type PriceRow = {
  id: string;
  productCode: 'G10' | 'G15' | 'G45' | 'G15_AUTO' | 'G20';
  customerType: 'final' | 'comercio' | 'distribuidor';
  amount: number;
  validFrom: Date;
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
        validFrom: new Date('1970-01-01T00:00:00.000Z'),
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
      create: jest.Mock;
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
        create: jest.fn(),
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
          validFrom: new Date('1970-01-01T00:00:00.000Z'),
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
    // Antes esto pisaba la fila con un UPDATE. Ese comportamiento era el
    // problema, no la solucion: sobreescribir el precio borra el numero al que
    // ya se vendio, y con el la unica forma de retarifar una venta vieja.
    it('never mutates an existing row', async () => {
      prisma.productPrice.create.mockResolvedValue({
        ...buildFullPriceRows()[0],
        amount: 9999,
      });

      const result = await service.updatePrice('G10', 'final', 9999);

      expect(prisma.productPrice.update).not.toHaveBeenCalled();
      expect(prisma.productPrice.create).toHaveBeenCalled();
      expect(result.amount).toBe(9999);
    });

    it('never touches the Sale table when setting a price', async () => {
      prisma.productPrice.create.mockResolvedValue(buildFullPriceRows()[0]);

      await service.updatePrice('G10', 'final', 5000);

      expect(prisma.sale.findMany).not.toHaveBeenCalled();
      expect(prisma.sale.update).not.toHaveBeenCalled();
      expect(prisma.sale.create).not.toHaveBeenCalled();
    });
  });
});

describe('PricesService — historical pricing', () => {
  let service: PricesService;
  let prisma: {
    product: { findMany: jest.Mock };
    productPrice: { findMany: jest.Mock; create: jest.Mock };
  };

  const priceRow = (
    amount: number,
    validFrom: string,
    customerType: PriceRow['customerType'] = 'final',
  ): PriceRow => ({
    id: `price-${customerType}-${amount}`,
    productCode: 'G10',
    customerType,
    amount,
    validFrom: new Date(validFrom),
    updatedAt: new Date(validFrom),
  });

  /**
   * La tabla exige las tres combinaciones de cada producto, asi que los otros
   * dos tipos de cliente tienen que existir desde siempre para que los tests
   * puedan variar solo `final`, que es lo que se esta probando.
   */
  const OTHER_TYPES_SINCE_EPOCH: PriceRow[] = [
    priceRow(8200, '1970-01-01T00:00:00.000Z', 'comercio'),
    priceRow(7900, '1970-01-01T00:00:00.000Z', 'distribuidor'),
  ];

  beforeEach(async () => {
    prisma = {
      product: { findMany: jest.fn().mockResolvedValue([{ code: 'G10' }]) },
      productPrice: { findMany: jest.fn(), create: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [PricesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(PricesService);
  });

  const twoVersions = () => [
    priceRow(8500, '1970-01-01T00:00:00.000Z'),
    priceRow(9500, '2026-08-20T00:00:00.000Z'),
  ];

  /**
   * El servicio empuja el filtro por fecha a la base. Un mock que devuelve
   * todo sin mirar el `where` no estaria simulando una base de datos, y estos
   * tests pasarian o fallarian por la razon equivocada.
   */
  const givenPriceVersions = (finalVersions: PriceRow[]) => {
    const rows = [...finalVersions, ...OTHER_TYPES_SINCE_EPOCH];
    prisma.productPrice.findMany.mockImplementation(
      ({ where }: { where?: { validFrom?: { lte?: Date } } } = {}) => {
        const limit = where?.validFrom?.lte;
        const visible = limit
          ? rows.filter((row) => row.validFrom.getTime() <= limit.getTime())
          : rows;
        return Promise.resolve(
          [...visible].sort((a, b) => a.validFrom.getTime() - b.validFrom.getTime()),
        );
      },
    );
  };

  describe('getPriceTableAt', () => {
    it('uses the price in force on that date, not the newest one', async () => {
      givenPriceVersions(twoVersions());

      const table = await service.getPriceTableAt(new Date('2026-08-15T00:00:00.000Z'));

      expect(table.final.G10).toBe(8500);
    });

    it('uses the new price for a date after the change', async () => {
      givenPriceVersions(twoVersions());

      const table = await service.getPriceTableAt(new Date('2026-08-25T00:00:00.000Z'));

      expect(table.final.G10).toBe(9500);
    });

    // El limite exacto importa: un precio que rige "desde" un instante ya rige
    // en ese instante.
    it('applies a price starting exactly at its validFrom', async () => {
      givenPriceVersions(twoVersions());

      const table = await service.getPriceTableAt(new Date('2026-08-20T00:00:00.000Z'));

      expect(table.final.G10).toBe(9500);
    });

    it('picks the latest of several versions before the date', async () => {
      givenPriceVersions([
        priceRow(8500, '1970-01-01T00:00:00.000Z'),
        priceRow(9000, '2026-08-10T00:00:00.000Z'),
        priceRow(9500, '2026-08-20T00:00:00.000Z'),
      ]);

      const table = await service.getPriceTableAt(new Date('2026-08-15T00:00:00.000Z'));

      expect(table.final.G10).toBe(9000);
    });

    it('throws when no version was in force yet on that date', async () => {
      givenPriceVersions([priceRow(9500, '2026-08-20T00:00:00.000Z')]);

      await expect(
        service.getPriceTableAt(new Date('2026-08-01T00:00:00.000Z')),
      ).rejects.toThrow(/G10/);
    });
  });

  describe('updatePrice', () => {
    // Append-only: pisar la fila destruiria el precio al que ya se vendio.
    it('inserts a new version instead of updating the existing row', async () => {
      const at = new Date('2026-08-27T12:00:00.000Z');
      prisma.productPrice.create.mockResolvedValue(priceRow(9900, at.toISOString()));

      await service.updatePrice('G10', 'final', 9900, at);

      expect(prisma.productPrice.create).toHaveBeenCalledWith({
        data: {
          productCode: 'G10',
          customerType: 'final',
          amount: 9900,
          validFrom: at,
        },
      });
    });
  });
});
