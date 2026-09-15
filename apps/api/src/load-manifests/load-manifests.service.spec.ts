import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { CreateLoadManifestInput, LoadManifestRecord } from '@distribuidor/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { LoadManifestsService } from './load-manifests.service';
import { SalesService } from '../sales/sales.service';
import { PricesService } from '../prices/prices.service';
import { CustomerCategoriesService } from '../customer-categories/customer-categories.service';
import { PaymentMethodsService } from '../payment-methods/payment-methods.service';

function buildManifestRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'manifest-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    driverName: 'juan.perez',
    truckId: 'truck-1',
    truckCode: null,
    photoRef: null,
    note: null,
    items: [{ productCode: 'G10', quantity: 10 }],
    ...overrides,
  };
}

function buildCreateInput(overrides: Partial<CreateLoadManifestInput> = {}): CreateLoadManifestInput {
  return {
    driverName: 'someone-else',
    truckId: 'truck-1',
    items: [{ productCode: 'G10', quantity: 10 }],
    ...overrides,
  };
}

describe('LoadManifestsService', () => {
  let service: LoadManifestsService;
  let prisma: {
    loadManifest: { create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock };
    loadManifestItem: { findMany: jest.Mock };
    saleItem: { findMany: jest.Mock };
    product: { findMany: jest.Mock };
    truck: { findUnique: jest.Mock };
  };

  let productsService: { assertProductCodesExist: jest.Mock };

  beforeEach(async () => {
    productsService = { assertProductCodesExist: jest.fn().mockResolvedValue(undefined) };
    prisma = {
      loadManifest: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
      loadManifestItem: { findMany: jest.fn() },
      saleItem: { findMany: jest.fn() },
      // El catalogo del stock sale de la base, no de PRODUCT_CODES.
      product: {
        findMany: jest.fn().mockResolvedValue(
          ['G10', 'G15', 'G45', 'G15_AUTO'].map((code) => ({ code })),
        ),
      },
      truck: { findUnique: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        LoadManifestsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ProductsService, useValue: productsService },
      ],
    }).compile();

    service = moduleRef.get(LoadManifestsService);
  });

  describe('createManifest', () => {
    beforeEach(() => {
      prisma.truck.findUnique.mockResolvedValue({ id: 'truck-1', isActive: true });
    });

    it('resolves driverName from actorUsername only, ignoring any driverName in the payload', async () => {
      prisma.loadManifest.create.mockResolvedValue(buildManifestRow({ driverName: 'juan.perez' }));

      await service.createManifest(buildCreateInput({ driverName: 'someone-else' }), 'juan.perez');

      expect(prisma.loadManifest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ driverName: 'juan.perez' }),
        }),
      );
    });

    // packages/shared valida la forma del codigo pero no puede saber cuales
    // existen: el catalogo lo define el admin en runtime.
    it('verifies every productCode against the catalogue before writing', async () => {
      prisma.loadManifest.create.mockResolvedValue(buildManifestRow());

      await service.createManifest(
        buildCreateInput({ items: [{ productCode: 'G10', quantity: 3 }] }),
        'juan.perez',
      );

      expect(productsService.assertProductCodesExist).toHaveBeenCalledWith(['G10']);
    });

    it('creates nothing when a productCode is not in the catalogue', async () => {
      productsService.assertProductCodesExist.mockRejectedValue(
        new Error('Unknown productCode: G99'),
      );

      await expect(
        service.createManifest(
          buildCreateInput({ items: [{ productCode: 'G99', quantity: 1 }] }),
          'juan.perez',
        ),
      ).rejects.toThrow(/G99/);
      expect(prisma.loadManifest.create).not.toHaveBeenCalled();
    });

    it('trims actorUsername before persisting it as driverName', async () => {
      prisma.loadManifest.create.mockResolvedValue(buildManifestRow({ driverName: 'juan.perez' }));

      await service.createManifest(buildCreateInput(), '  juan.perez  ');

      expect(prisma.loadManifest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ driverName: 'juan.perez' }),
        }),
      );
    });

    it('validates truckId exists before writing: rejects an unknown truckId with NotFoundException and creates nothing', async () => {
      prisma.truck.findUnique.mockResolvedValue(null);

      await expect(
        service.createManifest(buildCreateInput({ truckId: 'missing-truck' }), 'juan.perez'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.loadManifest.create).not.toHaveBeenCalled();
    });

    it('validates truckId is active before writing: rejects an inactive truck with ConflictException and creates nothing', async () => {
      prisma.truck.findUnique.mockResolvedValue({ id: 'truck-1', isActive: false });

      await expect(
        service.createManifest(buildCreateInput({ truckId: 'truck-1' }), 'juan.perez'),
      ).rejects.toThrow(ConflictException);
      expect(prisma.loadManifest.create).not.toHaveBeenCalled();
    });

    it('looks up the truck by the payload truckId before creating the manifest', async () => {
      prisma.loadManifest.create.mockResolvedValue(buildManifestRow());

      await service.createManifest(buildCreateInput({ truckId: 'truck-1' }), 'juan.perez');

      expect(prisma.truck.findUnique).toHaveBeenCalledWith({ where: { id: 'truck-1' } });
      expect(prisma.loadManifest.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ truckId: 'truck-1' }) }),
      );
    });

    it('maps items to prisma create shape (productCode, quantity)', async () => {
      prisma.loadManifest.create.mockResolvedValue(buildManifestRow());

      await service.createManifest(
        buildCreateInput({ items: [{ productCode: 'G15', quantity: 3 }] }),
        'juan.perez',
      );

      expect(prisma.loadManifest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            items: { create: [{ productCode: 'G15', quantity: 3 }] },
          }),
          include: { items: true },
        }),
      );
    });

    it('persists optional photoRef and note, null when omitted', async () => {
      prisma.loadManifest.create.mockResolvedValue(buildManifestRow());

      await service.createManifest(buildCreateInput(), 'juan.perez');

      expect(prisma.loadManifest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ photoRef: null, note: null }),
        }),
      );
    });

    it('trims and persists photoRef/note when provided', async () => {
      prisma.loadManifest.create.mockResolvedValue(buildManifestRow());

      await service.createManifest(
        buildCreateInput({ photoRef: '  photo.jpg  ', note: '  nota  ' }),
        'juan.perez',
      );

      expect(prisma.loadManifest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ photoRef: 'photo.jpg', note: 'nota' }),
        }),
      );
    });

    it('maps the created prisma row to a LoadManifestRecord', async () => {
      prisma.loadManifest.create.mockResolvedValue(
        buildManifestRow({
          truckCode: 'CAMION-01',
          photoRef: 'photo.jpg',
          note: 'nota',
        }),
      );

      const result: LoadManifestRecord = await service.createManifest(
        buildCreateInput({ truckCode: 'CAMION-01' }),
        'juan.perez',
      );

      expect(result).toEqual({
        id: 'manifest-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        driverName: 'juan.perez',
        truckId: 'truck-1',
        truckCode: 'CAMION-01',
        items: [{ productCode: 'G10', quantity: 10 }],
        photoRef: 'photo.jpg',
        note: 'nota',
      });
    });
  });

  describe('listManifests', () => {
    it('returns all manifests ordered newest-first', async () => {
      prisma.loadManifest.findMany.mockResolvedValue([]);

      await service.listManifests();

      expect(prisma.loadManifest.findMany).toHaveBeenCalledWith({
        include: { items: true },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('maps prisma rows to LoadManifestRecord shape', async () => {
      prisma.loadManifest.findMany.mockResolvedValue([buildManifestRow()]);

      const result = await service.listManifests();

      expect(result).toEqual([
        {
          id: 'manifest-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          driverName: 'juan.perez',
          truckId: 'truck-1',
          truckCode: undefined,
          items: [{ productCode: 'G10', quantity: 10 }],
          photoRef: undefined,
          note: undefined,
        },
      ]);
    });
  });

  describe('listManifestsByDriver', () => {
    it('queries manifests scoped to a where clause containing only the given driverName', async () => {
      prisma.loadManifest.findMany.mockResolvedValue([]);

      await service.listManifestsByDriver('juan.perez');

      expect(prisma.loadManifest.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.loadManifest.findMany).toHaveBeenCalledWith({
        where: { driverName: 'juan.perez' },
        include: { items: true },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('does not merge any additional caller-supplied filter into the where clause', async () => {
      prisma.loadManifest.findMany.mockResolvedValue([]);

      await service.listManifestsByDriver('juan.perez');

      const callArgs = prisma.loadManifest.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(Object.keys(callArgs.where)).toEqual(['driverName']);
    });

    it('scopes strictly to the requested driver, excluding another driver even if present in storage', async () => {
      prisma.loadManifest.findMany.mockResolvedValue([]);

      await service.listManifestsByDriver('maria.gomez');

      expect(prisma.loadManifest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { driverName: 'maria.gomez' } }),
      );
    });
  });

  describe('getTruckStock', () => {
    beforeEach(() => {
      prisma.loadManifestItem.findMany.mockResolvedValue([]);
      prisma.saleItem.findMany.mockResolvedValue([]);
    });

    it('computes loaded, sold, and remaining per product from manifests and active sales', async () => {
      prisma.loadManifestItem.findMany.mockResolvedValue([
        { productCode: 'G10', quantity: 10 },
        { productCode: 'G10', quantity: 5 },
        { productCode: 'G15', quantity: 4 },
      ]);
      prisma.saleItem.findMany.mockResolvedValue([
        { productCode: 'G10', quantity: 3 },
        { productCode: 'G10', quantity: 2 },
      ]);

      const result = await service.getTruckStock('truck-1', '2026-01-31');

      expect(result.truckId).toBe('truck-1');
      expect(result.asOf).toBe('2026-01-31');
      expect(result.lines).toHaveLength(4);
      expect(result.lines).toEqual(
        expect.arrayContaining([
          { productCode: 'G10', loaded: 15, sold: 5, remaining: 10 },
          { productCode: 'G15', loaded: 4, sold: 0, remaining: 4 },
          { productCode: 'G45', loaded: 0, sold: 0, remaining: 0 },
          { productCode: 'G15_AUTO', loaded: 0, sold: 0, remaining: 0 },
        ]),
      );
    });

    it('does not clamp remaining to zero when sold exceeds loaded', async () => {
      prisma.loadManifestItem.findMany.mockResolvedValue([{ productCode: 'G10', quantity: 5 }]);
      prisma.saleItem.findMany.mockResolvedValue([{ productCode: 'G10', quantity: 8 }]);

      const result = await service.getTruckStock('truck-1', '2026-01-31');

      const g10 = result.lines.find((line) => line.productCode === 'G10');
      expect(g10).toEqual({ productCode: 'G10', loaded: 5, sold: 8, remaining: -3 });
    });

    it('returns loaded=0 for every product and does not throw when the truck has no manifests', async () => {
      prisma.saleItem.findMany.mockResolvedValue([{ productCode: 'G10', quantity: 2 }]);

      const result = await service.getTruckStock('truck-1', '2026-01-31');

      expect(result.lines).toHaveLength(4);
      expect(result.lines.every((line) => line.loaded === 0)).toBe(true);
      const g10 = result.lines.find((line) => line.productCode === 'G10');
      expect(g10).toEqual({ productCode: 'G10', loaded: 0, sold: 2, remaining: -2 });
    });

    it('filters loadManifestItem by manifest.truckId and manifest.createdAt up to the end of asOf in business time (ART, UTC-3)', async () => {
      await service.getTruckStock('truck-1', '2026-01-31');

      expect(prisma.loadManifestItem.findMany).toHaveBeenCalledWith({
        where: {
          manifest: {
            truckId: 'truck-1',
            createdAt: { lt: new Date('2026-02-01T03:00:00.000Z') },
          },
        },
      });
    });

    it('filters saleItem by sale.truckId, active status only, and sale.createdAt up to the end of asOf in business time (ART, UTC-3)', async () => {
      await service.getTruckStock('truck-1', '2026-01-31');

      expect(prisma.saleItem.findMany).toHaveBeenCalledWith({
        where: {
          sale: {
            truckId: 'truck-1',
            status: 'active',
            createdAt: { lt: new Date('2026-02-01T03:00:00.000Z') },
          },
        },
      });
    });

    it('does not exclude a sale made at 22:00 ART (01:00Z next day) from the same-day asOf window', async () => {
      prisma.saleItem.findMany.mockResolvedValue([{ productCode: 'G10', quantity: 4 }]);

      await service.getTruckStock('truck-1', '2026-01-31');

      const callArgs = prisma.saleItem.findMany.mock.calls[0][0] as {
        where: { sale: { createdAt: { lt: Date } } };
      };
      const lateEveningSaleUtc = new Date('2026-02-01T01:00:00.000Z');
      expect(lateEveningSaleUtc.getTime()).toBeLessThan(callArgs.where.sale.createdAt.lt.getTime());
    });
  });
  describe('getTruckStockForDay', () => {
    beforeEach(() => {
      prisma.loadManifestItem.findMany.mockResolvedValue([]);
      prisma.saleItem.findMany.mockResolvedValue([]);
      prisma.loadManifest.findFirst.mockResolvedValue(null);
    });

    it('computes loaded, sold, and remaining per product for that single day', async () => {
      prisma.loadManifestItem.findMany.mockResolvedValue([
        { productCode: 'G10', quantity: 30 },
        { productCode: 'G15', quantity: 25 },
      ]);
      prisma.saleItem.findMany.mockResolvedValue([
        { productCode: 'G10', quantity: 18 },
        { productCode: 'G15', quantity: 16 },
      ]);

      const result = await service.getTruckStockForDay('truck-1', '2026-01-31');

      expect(result.truckId).toBe('truck-1');
      expect(result.date).toBe('2026-01-31');
      expect(result.lines).toEqual(
        expect.arrayContaining([
          { productCode: 'G10', loaded: 30, sold: 18, remaining: 12 },
          { productCode: 'G15', loaded: 25, sold: 16, remaining: 9 },
          { productCode: 'G45', loaded: 0, sold: 0, remaining: 0 },
          { productCode: 'G15_AUTO', loaded: 0, sold: 0, remaining: 0 },
        ]),
      );
    });

    it('bounds both queries to the business day, so yesterday never leaks into today', async () => {
      await service.getTruckStockForDay('truck-1', '2026-01-31');

      const dayWindow = {
        gte: new Date('2026-01-31T03:00:00.000Z'),
        lt: new Date('2026-02-01T03:00:00.000Z'),
      };

      expect(prisma.loadManifestItem.findMany).toHaveBeenCalledWith({
        where: { manifest: { truckId: 'truck-1', createdAt: dayWindow } },
      });
      expect(prisma.saleItem.findMany).toHaveBeenCalledWith({
        where: { sale: { truckId: 'truck-1', status: 'active', createdAt: dayWindow } },
      });
    });

    it('reports the LAST manifest of the day as manifestAt', async () => {
      prisma.loadManifest.findFirst.mockResolvedValue({
        createdAt: new Date('2026-01-31T10:10:00.000Z'),
      });

      const result = await service.getTruckStockForDay('truck-1', '2026-01-31');

      expect(result.manifestAt).toBe('2026-01-31T10:10:00.000Z');
      expect(prisma.loadManifest.findFirst).toHaveBeenCalledWith({
        where: {
          truckId: 'truck-1',
          createdAt: {
            gte: new Date('2026-01-31T03:00:00.000Z'),
            lt: new Date('2026-02-01T03:00:00.000Z'),
          },
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
    });

    it('returns manifestAt null and zeroed lines when nothing was loaded today', async () => {
      const result = await service.getTruckStockForDay('truck-1', '2026-01-31');

      expect(result.manifestAt).toBeNull();
      expect(result.lines).toHaveLength(4);
      expect(result.lines.every((line) => line.loaded === 0)).toBe(true);
    });

    it('does not clamp remaining when a sale exceeds what was loaded today', async () => {
      prisma.loadManifestItem.findMany.mockResolvedValue([{ productCode: 'G10', quantity: 5 }]);
      prisma.saleItem.findMany.mockResolvedValue([{ productCode: 'G10', quantity: 8 }]);

      const result = await service.getTruckStockForDay('truck-1', '2026-01-31');

      expect(result.lines.find((line) => line.productCode === 'G10')).toEqual({
        productCode: 'G10',
        loaded: 5,
        sold: 8,
        remaining: -3,
      });
    });
  });
});

/**
 * La trampa que hace posible todo el cambio de envase, fijada con un test.
 *
 * `getTruckStockForDay` suma TODA linea de `SaleItem` sin filtrar por `kind`.
 * Eso es lo que hace que el reemplazo de un cambio descuente del camion sin
 * tocar una linea de esa consulta, y es exactamente lo que prohibe guardar ahi
 * lo que VUELVE: una unidad que entra anotada como `SaleItem` se contaria como
 * mercaderia que salio, y los numeros dejarian de cerrar contra el remito de
 * la manana sin que nada falle.
 *
 * El test no inventa las filas: se las pide a `createSale`, asi que prueba los
 * bytes que la venta realmente escribe y no una suposicion sobre ellos.
 */
describe('getTruckStockForDay frente a una visita mixta', () => {
  it('discounts what was sold plus the swap replacement, and not one unit more', async () => {
    const salesPrisma = {
      sale: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      saleItem: { deleteMany: jest.fn() },
      saleReturnItem: { deleteMany: jest.fn() },
      saleAudit: { create: jest.fn() },
      customer: { findUnique: jest.fn() },
      truck: { findUnique: jest.fn().mockResolvedValue({ id: 'truck-1', isActive: true }) },
      $transaction: jest.fn(),
    };
    salesPrisma.sale.create.mockResolvedValue({
      id: 'sale-1',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
      status: 'active',
      canceledAt: null,
      cancelReason: null,
      driverName: 'juan.perez',
      truckCode: null,
      total: 200,
      customerName: 'Kiosco Sur',
      customerType: 'final',
      paymentMethod: 'efectivo',
      note: null,
      kind: 'sale',
      containerReturned: true,
      paymentProofRef: null,
      latitude: null,
      longitude: null,
      customerId: null,
      items: [],
      returnItems: [],
    });

    const catalogueProducts = {
      assertProductCodesExist: jest.fn().mockResolvedValue(undefined),
    };

    const salesModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: PrismaService, useValue: salesPrisma },
        {
          provide: PricesService,
          useValue: {
            getPriceTable: jest.fn(),
            getPriceTableAt: jest
              .fn()
              .mockResolvedValue({ final: { G10: 100, G15: 200, G45: 300 } }),
          },
        },
        { provide: ProductsService, useValue: catalogueProducts },
        {
          provide: CustomerCategoriesService,
          useValue: { assertCategoryCodesExist: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: PaymentMethodsService,
          useValue: { assertPaymentMethodCodesExist: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    // Vende 2 G10, le devuelven 1 envase vacio de G10 y le cambian 1 G15
    // fallado. Del camion salen 2 G10 y 1 G15 de reemplazo: nada mas.
    await salesModule.get(SalesService).createSale({
      driverName: 'juan.perez',
      customerName: 'Kiosco Sur',
      customerType: 'final',
      paymentMethod: 'efectivo',
      truckId: 'truck-1',
      items: [{ productCode: 'G10', quantity: 2 }],
      returnedItems: [{ productCode: 'G10', quantity: 1 }],
      swappedItems: [{ productCode: 'G15', quantity: 1 }],
    });

    const written = salesPrisma.sale.create.mock.calls[0][0].data as {
      items: { create: { productCode: string; quantity: number }[] };
      returnItems: { create: unknown[] };
    };

    // Lo que vuelve NO es un SaleItem, y por eso la consulta de stock no lo ve.
    expect(written.returnItems.create).toHaveLength(2);

    const stockPrisma = {
      loadManifest: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({
          createdAt: new Date('2026-01-01T08:00:00.000Z'),
        }),
      },
      loadManifestItem: {
        findMany: jest.fn().mockResolvedValue([
          { productCode: 'G10', quantity: 10 },
          { productCode: 'G15', quantity: 5 },
        ]),
      },
      // Exactamente las lineas que `createSale` acaba de escribir.
      saleItem: { findMany: jest.fn().mockResolvedValue(written.items.create) },
      product: {
        findMany: jest
          .fn()
          .mockResolvedValue(['G10', 'G15', 'G45'].map((code) => ({ code }))),
      },
      truck: { findUnique: jest.fn() },
    };

    const stockModule = await Test.createTestingModule({
      providers: [
        LoadManifestsService,
        { provide: PrismaService, useValue: stockPrisma },
        { provide: ProductsService, useValue: catalogueProducts },
      ],
    }).compile();

    const stock = await stockModule
      .get(LoadManifestsService)
      .getTruckStockForDay('truck-1', '2026-01-01');
    const byProduct = Object.fromEntries(stock.lines.map((line) => [line.productCode, line]));

    // 2 vendidas. El vacio que volvio no las devuelve al camion.
    expect(byProduct.G10).toEqual({ productCode: 'G10', loaded: 10, sold: 2, remaining: 8 });
    // 1 de reemplazo salio del camion. La fallada que entro no la suma.
    expect(byProduct.G15).toEqual({ productCode: 'G15', loaded: 5, sold: 1, remaining: 4 });
    expect(byProduct.G45).toEqual({ productCode: 'G45', loaded: 0, sold: 0, remaining: 0 });
  });
});
