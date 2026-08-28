import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type {
  CreateSaleInput,
  PriceTable,
  RecordEmptyVisitInput,
  SaleRecord,
  UpdateSaleInput,
} from '@distribuidor/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PricesService } from '../prices/prices.service';
import { ProductsService } from '../products/products.service';
import { SalesService } from './sales.service';

const CUSTOM_PRICE_TABLE: PriceTable = {
  final: { G10: 100, G15: 200, G45: 300, G15_AUTO: 400 },
  comercio: { G10: 90, G15: 180, G45: 270, G15_AUTO: 360 },
  distribuidor: { G10: 80, G15: 160, G45: 240, G15_AUTO: 320 },
};

function buildSaleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sale-1',
    clientGeneratedId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    occurredAt: new Date('2026-01-01T00:00:00.000Z'),
    status: 'active',
    canceledAt: null,
    cancelReason: null,
    driverName: 'Juan',
    truckCode: null,
    customerName: 'Kiosco Sur',
    customerType: 'final',
    paymentMethod: 'efectivo',
    total: 0,
    note: null,
    kind: 'sale',
    containerReturned: null,
    paymentProofRef: null,
    latitude: null,
    longitude: null,
    customerId: null,
    items: [{ productCode: 'G10', quantity: 2 }],
    ...overrides,
  };
}

function buildChurnRow(overrides: Record<string, unknown> = {}) {
  return buildSaleRow({
    kind: 'churn',
    paymentMethod: null,
    total: 0,
    containerReturned: true,
    items: [],
    ...overrides,
  });
}

function buildCreateInput(overrides: Partial<CreateSaleInput> = {}): CreateSaleInput {
  return {
    driverName: 'Juan',
    customerName: 'Kiosco Sur',
    customerType: 'final',
    paymentMethod: 'efectivo',
    items: [{ productCode: 'G10', quantity: 2 }],
    ...overrides,
  };
}

function buildUpdateInput(overrides: Partial<UpdateSaleInput> = {}): UpdateSaleInput {
  return {
    ...buildCreateInput(overrides),
    reason: 'Corrección de venta',
  };
}

function buildRecordEmptyVisitInput(
  overrides: Partial<RecordEmptyVisitInput> = {},
): RecordEmptyVisitInput {
  return {
    driverName: 'Juan',
    customerName: 'Kiosco Sur',
    customerType: 'final',
    ...overrides,
  };
}

describe('SalesService', () => {
  let service: SalesService;
  let prisma: {
    sale: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock; findMany: jest.Mock };
    saleItem: { deleteMany: jest.Mock };
    saleAudit: { create: jest.Mock };
    customer: { findUnique: jest.Mock };
    truck: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let pricesService: { getPriceTable: jest.Mock; getPriceTableAt: jest.Mock };
  let productsService: { assertProductCodesExist: jest.Mock };

  beforeEach(async () => {
    prisma = {
      sale: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      saleItem: { deleteMany: jest.fn() },
      saleAudit: { create: jest.fn() },
      customer: { findUnique: jest.fn() },
      truck: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };
    pricesService = {
      getPriceTable: jest.fn().mockResolvedValue(CUSTOM_PRICE_TABLE),
      getPriceTableAt: jest.fn().mockResolvedValue(CUSTOM_PRICE_TABLE),
    };
    productsService = { assertProductCodesExist: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: PrismaService, useValue: prisma },
        { provide: PricesService, useValue: pricesService },
        { provide: ProductsService, useValue: productsService },
      ],
    }).compile();

    service = moduleRef.get(SalesService);
  });

  describe('createSale', () => {
    it('behaves exactly as before when customerId/truckId are absent (free text only)', async () => {
      prisma.sale.create.mockResolvedValue(buildSaleRow({ total: 200 }));

      const result = await service.createSale(buildCreateInput());

      expect(prisma.customer.findUnique).not.toHaveBeenCalled();
      expect(prisma.truck.findUnique).not.toHaveBeenCalled();
      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            customerName: 'Kiosco Sur',
            customerType: 'final',
            customerId: null,
            truckId: null,
            total: 200,
          }),
        }),
      );
      expect(result.total).toBe(200);
    });

    it('overrides client customerType and denormalizes customerName from the linked active Customer', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        id: 'customer-1',
        name: 'Distribuidora Norte',
        customerType: 'distribuidor',
        isActive: true,
      });
      prisma.sale.create.mockResolvedValue(buildSaleRow({ total: 160 }));

      await service.createSale(
        buildCreateInput({
          customerId: 'customer-1',
          customerType: 'final',
          customerName: 'Nombre incorrecto del cliente',
        }),
      );

      expect(prisma.customer.findUnique).toHaveBeenCalledWith({ where: { id: 'customer-1' } });
      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            customerType: 'distribuidor',
            customerName: 'Distribuidora Norte',
            customerId: 'customer-1',
            total: 160,
          }),
        }),
      );
    });

    it('rejects an unknown customerId with NotFoundException and creates nothing', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);

      await expect(
        service.createSale(buildCreateInput({ customerId: 'missing-customer' })),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.sale.create).not.toHaveBeenCalled();
    });

    it('rejects a customerId linked to an inactive Customer with ConflictException and creates nothing', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        id: 'customer-1',
        name: 'Kiosco Sur',
        customerType: 'final',
        isActive: false,
      });

      await expect(
        service.createSale(buildCreateInput({ customerId: 'customer-1' })),
      ).rejects.toThrow(ConflictException);
      expect(prisma.sale.create).not.toHaveBeenCalled();
    });

    it('links a valid active truckId to the created sale', async () => {
      prisma.truck.findUnique.mockResolvedValue({ id: 'truck-1', isActive: true });
      prisma.sale.create.mockResolvedValue(buildSaleRow({ total: 200 }));

      await service.createSale(buildCreateInput({ truckId: 'truck-1' }));

      expect(prisma.truck.findUnique).toHaveBeenCalledWith({ where: { id: 'truck-1' } });
      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ truckId: 'truck-1' }) }),
      );
    });

    it('rejects an unknown truckId with NotFoundException and creates nothing', async () => {
      prisma.truck.findUnique.mockResolvedValue(null);

      await expect(
        service.createSale(buildCreateInput({ truckId: 'missing-truck' })),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.sale.create).not.toHaveBeenCalled();
    });

    it('rejects a truckId linked to an inactive Truck with ConflictException and creates nothing', async () => {
      prisma.truck.findUnique.mockResolvedValue({ id: 'truck-1', isActive: false });

      await expect(
        service.createSale(buildCreateInput({ truckId: 'truck-1' })),
      ).rejects.toThrow(ConflictException);
      expect(prisma.sale.create).not.toHaveBeenCalled();
    });

    // packages/shared ya no puede saber que codigos existen -- el catalogo lo
    // define el admin en runtime -- asi que la pertenencia se verifica aca.
    // Sin esto un codigo inexistente llegaria hasta la FK y saldria como un
    // error de Prisma en vez de un 400 legible.
    // El precio unitario queda congelado en la linea. Es el registro
    // definitivo: ningun cambio de precio posterior puede alterar lo que esta
    // venta cobro.
    it('freezes the unit price on every sale item', async () => {
      prisma.sale.create.mockResolvedValue(buildSaleRow());

      await service.createSale(
        buildCreateInput({
          customerType: 'final',
          items: [
            { productCode: 'G10', quantity: 2 },
            { productCode: 'G45', quantity: 1 },
          ],
        }),
      );

      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            items: {
              create: [
                { productCode: 'G10', quantity: 2, unitPrice: 100 },
                { productCode: 'G45', quantity: 1, unitPrice: 300 },
              ],
            },
          }),
        }),
      );
    });

    it('derives the total from the frozen unit prices, so total and items can never disagree', async () => {
      prisma.sale.create.mockResolvedValue(buildSaleRow());

      await service.createSale(
        buildCreateInput({
          customerType: 'final',
          items: [
            { productCode: 'G10', quantity: 2 },
            { productCode: 'G45', quantity: 1 },
          ],
        }),
      );

      // 2 * 100 + 1 * 300
      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ total: 500 }) }),
      );
    });

    // El corazon del cambio: una venta hecha sin senal se tarifa con los
    // precios del momento en que ocurrio, no del momento en que llego.
    it('prices the sale at occurredAt, not at the time it arrived', async () => {
      prisma.sale.create.mockResolvedValue(buildSaleRow());
      const occurredAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

      await service.createSale(buildCreateInput({ occurredAt }));

      expect(pricesService.getPriceTableAt).toHaveBeenCalledWith(new Date(occurredAt));
    });

    it('persists occurredAt alongside the sale', async () => {
      prisma.sale.create.mockResolvedValue(buildSaleRow());
      const occurredAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      await service.createSale(buildCreateInput({ occurredAt }));

      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ occurredAt: new Date(occurredAt) }),
        }),
      );
    });

    it('falls back to now when the device sent no occurredAt', async () => {
      prisma.sale.create.mockResolvedValue(buildSaleRow());

      await service.createSale(buildCreateInput());

      const [[call]] = prisma.sale.create.mock.calls;
      expect(call.data.occurredAt).toBeInstanceOf(Date);
      expect(pricesService.getPriceTableAt).toHaveBeenCalledWith(call.data.occurredAt);
    });

    // Un reloj mal puesto no puede comprar precios viejos.
    it('ignores an occurredAt far outside the queue window', async () => {
      prisma.sale.create.mockResolvedValue(buildSaleRow());

      await service.createSale(
        buildCreateInput({ occurredAt: '2020-01-01T00:00:00.000Z' }),
      );

      const [[call]] = prisma.sale.create.mock.calls;
      expect(call.data.occurredAt.getFullYear()).toBeGreaterThan(2020);
    });

    it('verifies every productCode against the catalogue before writing', async () => {
      prisma.sale.create.mockResolvedValue(buildSaleRow());

      await service.createSale(
        buildCreateInput({ items: [{ productCode: 'G10', quantity: 2 }] }),
      );

      expect(productsService.assertProductCodesExist).toHaveBeenCalledWith(['G10']);
    });

    it('does not write anything when a productCode is not in the catalogue', async () => {
      productsService.assertProductCodesExist.mockRejectedValue(
        new Error('Unknown productCode: G99'),
      );

      await expect(
        service.createSale(buildCreateInput({ items: [{ productCode: 'G99', quantity: 1 }] })),
      ).rejects.toThrow(/G99/);
      expect(prisma.sale.create).not.toHaveBeenCalled();
    });

    it('computes the total from PricesService.getPriceTable, not DEFAULT_PRICE_TABLE', async () => {
      prisma.sale.create.mockResolvedValue(buildSaleRow({ total: 400 }));

      await service.createSale(
        buildCreateInput({ items: [{ productCode: 'G15_AUTO', quantity: 1 }] }),
      );

      // Ahora se pide la tabla vigente en la fecha de la venta, no la actual.
      expect(pricesService.getPriceTableAt).toHaveBeenCalledTimes(1);
      // DEFAULT_PRICE_TABLE.final.G15_AUTO is 14500; CUSTOM_PRICE_TABLE.final.G15_AUTO is 400.
      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ total: 400 }) }),
      );
    });

    it('stores paymentProofRef when provided in the payload', async () => {
      prisma.sale.create.mockResolvedValue(
        buildSaleRow({ paymentProofRef: 'https://example.com/uploads/receipt_1.jpg' }),
      );

      await service.createSale(
        buildCreateInput({ paymentProofRef: 'https://example.com/uploads/receipt_1.jpg' }),
      );

      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paymentProofRef: 'https://example.com/uploads/receipt_1.jpg',
          }),
        }),
      );
    });

    it('stores paymentProofRef as null when omitted from the payload', async () => {
      prisma.sale.create.mockResolvedValue(buildSaleRow());

      await service.createSale(buildCreateInput());

      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ paymentProofRef: null }),
        }),
      );
    });

    it('stores containerReturned when provided in the payload', async () => {
      prisma.sale.create.mockResolvedValue(buildSaleRow({ containerReturned: true }));

      await service.createSale(buildCreateInput({ containerReturned: true }));

      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ containerReturned: true }),
        }),
      );
    });

    it('stores containerReturned as null when omitted from the payload', async () => {
      prisma.sale.create.mockResolvedValue(buildSaleRow());

      await service.createSale(buildCreateInput());

      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ containerReturned: null }),
        }),
      );
    });

    it('stores latitude/longitude when provided in the payload', async () => {
      prisma.sale.create.mockResolvedValue(
        buildSaleRow({ latitude: -34.6037, longitude: -58.3816 }),
      );

      await service.createSale(buildCreateInput({ latitude: -34.6037, longitude: -58.3816 }));

      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ latitude: -34.6037, longitude: -58.3816 }),
        }),
      );
    });

    it('stores latitude/longitude as null when omitted from the payload', async () => {
      prisma.sale.create.mockResolvedValue(buildSaleRow());

      await service.createSale(buildCreateInput());

      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ latitude: null, longitude: null }),
        }),
      );
    });
  });

  describe('updateSale', () => {
    beforeEach(() => {
      prisma.sale.findUnique.mockResolvedValue(buildSaleRow());
      prisma.$transaction.mockImplementation(async (cb: (tx: typeof prisma) => unknown) => cb(prisma));
    });

    it('behaves exactly as before when customerId/truckId are absent (free text only)', async () => {
      prisma.sale.update.mockResolvedValue(buildSaleRow({ total: 200 }));

      const result = await service.updateSale('sale-1', buildUpdateInput());

      expect(prisma.customer.findUnique).not.toHaveBeenCalled();
      expect(prisma.truck.findUnique).not.toHaveBeenCalled();
      expect(prisma.sale.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            customerName: 'Kiosco Sur',
            customerType: 'final',
            total: 200,
          }),
        }),
      );
      expect(result.total).toBe(200);
    });

    it('overrides client customerType and denormalizes customerName from the linked active Customer', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        id: 'customer-1',
        name: 'Distribuidora Norte',
        customerType: 'distribuidor',
        isActive: true,
      });
      prisma.sale.update.mockResolvedValue(buildSaleRow({ total: 160 }));

      await service.updateSale(
        'sale-1',
        buildUpdateInput({ customerId: 'customer-1', customerType: 'final' }),
      );

      expect(prisma.sale.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            customerType: 'distribuidor',
            customerName: 'Distribuidora Norte',
            total: 160,
          }),
        }),
      );
    });

    it('rejects an unknown customerId with NotFoundException and mutates nothing', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);

      await expect(
        service.updateSale('sale-1', buildUpdateInput({ customerId: 'missing-customer' })),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.sale.update).not.toHaveBeenCalled();
    });

    it('rejects a truckId linked to an inactive Truck with ConflictException and mutates nothing', async () => {
      prisma.truck.findUnique.mockResolvedValue({ id: 'truck-1', isActive: false });

      await expect(
        service.updateSale('sale-1', buildUpdateInput({ truckId: 'truck-1' })),
      ).rejects.toThrow(ConflictException);
      expect(prisma.sale.update).not.toHaveBeenCalled();
    });

    // Requisito 4 tambien vale para las correcciones: arreglar una cantidad de
    // una venta de marzo no puede moverle el precio a agosto.
    it('reprices an edit at the sale own occurredAt, never at today', async () => {
      const occurredAt = new Date('2026-03-10T12:00:00.000Z');
      prisma.sale.findUnique.mockResolvedValue(
        buildSaleRow({ occurredAt, items: [] }),
      );
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
        fn(prisma),
      );
      prisma.sale.update.mockResolvedValue(buildSaleRow({ occurredAt }));

      await service.updateSale('sale-1', buildUpdateInput());

      expect(pricesService.getPriceTableAt).toHaveBeenCalledWith(occurredAt);
    });

    it('freezes unit prices on the rewritten items too', async () => {
      const occurredAt = new Date('2026-03-10T12:00:00.000Z');
      prisma.sale.findUnique.mockResolvedValue(
        buildSaleRow({ occurredAt, items: [] }),
      );
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
        fn(prisma),
      );
      prisma.sale.update.mockResolvedValue(buildSaleRow({ occurredAt }));

      await service.updateSale(
        'sale-1',
        buildUpdateInput({
          customerType: 'final',
          items: [{ productCode: 'G10', quantity: 2 }],
        }),
      );

      const call = prisma.sale.update.mock.calls[0][0];
      expect(call.data.items.create).toEqual([
        { productCode: 'G10', quantity: 2, unitPrice: 100 },
      ]);
      expect(call.data.total).toBe(200);
    });

    it('computes the total from PricesService.getPriceTable, not DEFAULT_PRICE_TABLE', async () => {
      prisma.sale.update.mockResolvedValue(buildSaleRow({ total: 400 }));

      await service.updateSale(
        'sale-1',
        buildUpdateInput({ items: [{ productCode: 'G15_AUTO', quantity: 1 }] }),
      );

      expect(pricesService.getPriceTableAt).toHaveBeenCalledTimes(1);
      expect(prisma.sale.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ total: 400 }) }),
      );
    });

    it('throws ConflictException and writes nothing when input.kind disagrees with the stored kind (sale row, churn requested)', async () => {
      prisma.sale.findUnique.mockResolvedValue(buildSaleRow({ kind: 'sale' }));

      await expect(
        service.updateSale('sale-1', buildUpdateInput({ kind: 'churn' })),
      ).rejects.toThrow(ConflictException);
      expect(prisma.sale.update).not.toHaveBeenCalled();
      expect(prisma.saleAudit.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException when a stored churn row is edited without declaring kind=churn (defaults to sale)', async () => {
      prisma.sale.findUnique.mockResolvedValue(buildChurnRow());

      await expect(
        service.updateSale('sale-1', buildUpdateInput()),
      ).rejects.toThrow(ConflictException);
      expect(prisma.sale.update).not.toHaveBeenCalled();
      expect(prisma.saleAudit.create).not.toHaveBeenCalled();
    });

    it('edits a stored churn row successfully with no items/paymentMethod when input.kind matches, forcing paymentMethod=null and total=0', async () => {
      prisma.sale.findUnique.mockResolvedValue(buildChurnRow());
      prisma.sale.update.mockResolvedValue(buildChurnRow({ customerName: 'Nuevo nombre' }));

      const churnEdit = {
        driverName: 'Juan',
        customerName: 'Nuevo nombre',
        customerType: 'final',
        reason: 'Corrección de identidad',
        kind: 'churn',
      } as UpdateSaleInput;

      const result = await service.updateSale('sale-1', churnEdit);

      expect(prisma.sale.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paymentMethod: null,
            total: 0,
            items: { create: [] },
          }),
        }),
      );
      expect(prisma.saleAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'edited' }) }),
      );
      expect(result.kind).toBe('churn');
    });

    it('leaves normal-sale editing completely unchanged, whether or not input.kind is present', async () => {
      prisma.sale.update.mockResolvedValue(buildSaleRow({ total: 200 }));

      const result = await service.updateSale('sale-1', buildUpdateInput({ kind: 'sale' }));

      expect(prisma.sale.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ total: 200 }) }),
      );
      expect(result.total).toBe(200);
    });

    it('sets paymentProofRef on a kind=sale row when the edit payload supplies one', async () => {
      prisma.sale.findUnique.mockResolvedValue(buildSaleRow({ paymentProofRef: null }));
      prisma.sale.update.mockResolvedValue(
        buildSaleRow({ paymentProofRef: 'https://example.com/uploads/receipt_new.jpg' }),
      );

      const result = await service.updateSale(
        'sale-1',
        buildUpdateInput({ paymentProofRef: 'https://example.com/uploads/receipt_new.jpg' }),
      );

      expect(prisma.sale.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paymentProofRef: 'https://example.com/uploads/receipt_new.jpg',
          }),
        }),
      );
      expect(result.paymentProofRef).toBe('https://example.com/uploads/receipt_new.jpg');
    });

    it('changes an existing paymentProofRef on a kind=sale row to a new value', async () => {
      prisma.sale.findUnique.mockResolvedValue(
        buildSaleRow({ paymentProofRef: 'https://example.com/uploads/old.jpg' }),
      );
      prisma.sale.update.mockResolvedValue(
        buildSaleRow({ paymentProofRef: 'https://example.com/uploads/new.jpg' }),
      );

      await service.updateSale(
        'sale-1',
        buildUpdateInput({ paymentProofRef: 'https://example.com/uploads/new.jpg' }),
      );

      expect(prisma.sale.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paymentProofRef: 'https://example.com/uploads/new.jpg',
          }),
        }),
      );
    });

    it('clears an existing paymentProofRef on a kind=sale row when the edit payload omits it', async () => {
      prisma.sale.findUnique.mockResolvedValue(
        buildSaleRow({ paymentProofRef: 'https://example.com/uploads/old.jpg' }),
      );
      prisma.sale.update.mockResolvedValue(buildSaleRow({ paymentProofRef: null }));

      await service.updateSale('sale-1', buildUpdateInput());

      expect(prisma.sale.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ paymentProofRef: null }),
        }),
      );
    });

    it('sets containerReturned on a kind=sale row when the edit payload supplies it', async () => {
      prisma.sale.findUnique.mockResolvedValue(buildSaleRow({ containerReturned: null }));
      prisma.sale.update.mockResolvedValue(buildSaleRow({ containerReturned: true }));

      await service.updateSale('sale-1', buildUpdateInput({ containerReturned: true }));

      expect(prisma.sale.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ containerReturned: true }),
        }),
      );
    });

    it('clears containerReturned on a kind=sale row when the edit payload omits it', async () => {
      prisma.sale.findUnique.mockResolvedValue(buildSaleRow({ containerReturned: true }));
      prisma.sale.update.mockResolvedValue(buildSaleRow({ containerReturned: null }));

      await service.updateSale('sale-1', buildUpdateInput());

      expect(prisma.sale.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ containerReturned: null }),
        }),
      );
    });

    it('always stores paymentProofRef=null on a kind=churn row, even when the request supplies a value', async () => {
      prisma.sale.findUnique.mockResolvedValue(buildChurnRow());
      prisma.sale.update.mockResolvedValue(buildChurnRow());

      const churnEdit = {
        driverName: 'Juan',
        customerName: 'Nuevo nombre',
        customerType: 'final',
        reason: 'Corrección de identidad',
        kind: 'churn',
        paymentProofRef: 'https://example.com/uploads/smuggled.jpg',
      } as UpdateSaleInput;

      const result = await service.updateSale('sale-1', churnEdit);

      expect(prisma.sale.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ paymentProofRef: null }),
        }),
      );
      expect(result.paymentProofRef).toBeUndefined();
    });

    it('never changes a previously-stored latitude/longitude, even when the edit payload supplies different values', async () => {
      prisma.sale.findUnique.mockResolvedValue(
        buildSaleRow({ latitude: -34.6037, longitude: -58.3816 }),
      );
      prisma.sale.update.mockResolvedValue(
        buildSaleRow({ latitude: -34.6037, longitude: -58.3816 }),
      );

      await service.updateSale(
        'sale-1',
        buildUpdateInput({ latitude: 10, longitude: 20 }),
      );

      expect(prisma.sale.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ latitude: -34.6037, longitude: -58.3816 }),
        }),
      );
    });

    it('never populates a never-captured latitude/longitude (stored null), even when the edit payload supplies values', async () => {
      prisma.sale.findUnique.mockResolvedValue(buildSaleRow({ latitude: null, longitude: null }));
      prisma.sale.update.mockResolvedValue(buildSaleRow({ latitude: null, longitude: null }));

      await service.updateSale(
        'sale-1',
        buildUpdateInput({ latitude: -34.6037, longitude: -58.3816 }),
      );

      expect(prisma.sale.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ latitude: null, longitude: null }),
        }),
      );
    });

    it('includes paymentProofRef in the audit before/after snapshots', async () => {
      prisma.sale.findUnique.mockResolvedValue(
        buildSaleRow({ paymentProofRef: 'https://example.com/uploads/old.jpg' }),
      );
      prisma.sale.update.mockResolvedValue(
        buildSaleRow({ paymentProofRef: 'https://example.com/uploads/new.jpg' }),
      );

      await service.updateSale(
        'sale-1',
        buildUpdateInput({ paymentProofRef: 'https://example.com/uploads/new.jpg' }),
      );

      expect(prisma.saleAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            before: expect.objectContaining({
              paymentProofRef: 'https://example.com/uploads/old.jpg',
            }),
            after: expect.objectContaining({
              paymentProofRef: 'https://example.com/uploads/new.jpg',
            }),
          }),
        }),
      );
    });
  });

  describe('recordEmptyVisit', () => {
    it('creates a Sale forced to kind=churn, paymentMethod=null, total=0, containerReturned=true, zero items, and one created SaleAudit', async () => {
      prisma.sale.create.mockResolvedValue(buildChurnRow());

      const result = await service.recordEmptyVisit(buildRecordEmptyVisitInput());

      expect(prisma.customer.findUnique).not.toHaveBeenCalled();
      expect(prisma.truck.findUnique).not.toHaveBeenCalled();
      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            kind: 'churn',
            paymentMethod: null,
            total: 0,
            containerReturned: true,
            items: { create: [] },
            audits: { create: expect.objectContaining({ action: 'created' }) },
          }),
        }),
      );
      expect(result.kind).toBe('churn');
      expect(result.paymentMethod).toBeNull();
      expect(result.total).toBe(0);
      expect(result.containerReturned).toBe(true);
      expect(result.items).toEqual([]);
    });

    it('forces kind/paymentMethod/total/containerReturned/items server-side even if a caller smuggles conflicting values onto the input', async () => {
      prisma.sale.create.mockResolvedValue(buildChurnRow());

      const smuggledInput = {
        ...buildRecordEmptyVisitInput(),
        kind: 'sale',
        paymentMethod: 'efectivo',
        total: 999,
        containerReturned: false,
        items: [{ productCode: 'G10', quantity: 5 }],
      } as unknown as RecordEmptyVisitInput;

      await service.recordEmptyVisit(smuggledInput);

      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            kind: 'churn',
            paymentMethod: null,
            total: 0,
            containerReturned: true,
            items: { create: [] },
          }),
        }),
      );
    });

    it('resolves driverName from actorUsername over input.driverName, same as createSale', async () => {
      prisma.sale.create.mockResolvedValue(buildChurnRow({ driverName: 'maria.gomez' }));

      await service.recordEmptyVisit(
        buildRecordEmptyVisitInput({ driverName: 'Juan' }),
        'maria.gomez',
      );

      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ driverName: 'maria.gomez' }) }),
      );
    });

    it('denormalizes customerName/customerType from a linked active Customer, same as createSale', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        id: 'customer-1',
        name: 'Distribuidora Norte',
        customerType: 'distribuidor',
        isActive: true,
      });
      prisma.sale.create.mockResolvedValue(buildChurnRow());

      await service.recordEmptyVisit(
        buildRecordEmptyVisitInput({
          customerId: 'customer-1',
          customerType: 'final',
          customerName: 'nombre incorrecto',
        }),
      );

      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            customerType: 'distribuidor',
            customerName: 'Distribuidora Norte',
            customerId: 'customer-1',
          }),
        }),
      );
    });

    it('rejects an unknown customerId with NotFoundException and creates nothing', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);

      await expect(
        service.recordEmptyVisit(buildRecordEmptyVisitInput({ customerId: 'missing-customer' })),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.sale.create).not.toHaveBeenCalled();
    });

    it('rejects a customerId linked to an inactive Customer with ConflictException and creates nothing', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        id: 'customer-1',
        name: 'Kiosco Sur',
        customerType: 'final',
        isActive: false,
      });

      await expect(
        service.recordEmptyVisit(buildRecordEmptyVisitInput({ customerId: 'customer-1' })),
      ).rejects.toThrow(ConflictException);
      expect(prisma.sale.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown truckId with NotFoundException and creates nothing', async () => {
      prisma.truck.findUnique.mockResolvedValue(null);

      await expect(
        service.recordEmptyVisit(buildRecordEmptyVisitInput({ truckId: 'missing-truck' })),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.sale.create).not.toHaveBeenCalled();
    });

    it('rejects a truckId linked to an inactive Truck with ConflictException and creates nothing', async () => {
      prisma.truck.findUnique.mockResolvedValue({ id: 'truck-1', isActive: false });

      await expect(
        service.recordEmptyVisit(buildRecordEmptyVisitInput({ truckId: 'truck-1' })),
      ).rejects.toThrow(ConflictException);
      expect(prisma.sale.create).not.toHaveBeenCalled();
    });

    it('returns the existing row instead of creating a duplicate when clientGeneratedId already exists (offline-queue retry), same as createSale', async () => {
      const existingChurnRow = buildChurnRow({ clientGeneratedId: 'queue-item-1' });
      prisma.sale.findUnique.mockResolvedValue(existingChurnRow);

      const result = await service.recordEmptyVisit(
        buildRecordEmptyVisitInput({ clientGeneratedId: 'queue-item-1' }),
      );

      expect(prisma.sale.findUnique).toHaveBeenCalledWith({
        where: { clientGeneratedId: 'queue-item-1' },
        include: { items: true },
      });
      expect(prisma.sale.create).not.toHaveBeenCalled();
      expect(result.kind).toBe('churn');
    });

    it('creates a new row when clientGeneratedId is provided but no matching row exists yet', async () => {
      prisma.sale.findUnique.mockResolvedValue(null);
      prisma.sale.create.mockResolvedValue(buildChurnRow({ clientGeneratedId: 'queue-item-2' }));

      await service.recordEmptyVisit(
        buildRecordEmptyVisitInput({ clientGeneratedId: 'queue-item-2' }),
      );

      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ clientGeneratedId: 'queue-item-2' }),
        }),
      );
    });
  });

  describe('cancelSale', () => {
    it('cancels a churn row identically to a normal sale (regression guard — no code change to cancelSale)', async () => {
      prisma.sale.findUnique.mockResolvedValue(buildChurnRow({ status: 'active' }));
      prisma.sale.update.mockResolvedValue(
        buildChurnRow({ status: 'canceled', canceledAt: new Date('2026-01-02T00:00:00.000Z'), cancelReason: 'Cliente se mudó' }),
      );

      const result = await service.cancelSale('sale-1', { reason: 'Cliente se mudó' });

      expect(prisma.sale.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'canceled',
            cancelReason: 'Cliente se mudó',
            audits: { create: expect.objectContaining({ action: 'canceled' }) },
          }),
        }),
      );
      expect(result.status).toBe('canceled');
    });
  });

  describe('toSaleRecord customer link', () => {
    it('exposes the customerId so an edit can send it back instead of unlinking the sale', async () => {
      prisma.sale.findMany.mockResolvedValue([buildSaleRow({ customerId: 'customer-1' })]);

      const [record] = await service.listSalesByDriver('Juan');

      expect(record.customerId).toBe('customer-1');
    });

    it('omits the customerId for a sale that was never linked to a customer', async () => {
      prisma.sale.findMany.mockResolvedValue([buildSaleRow({ customerId: null })]);

      const [record] = await service.listSalesByDriver('Juan');

      expect(record.customerId).toBeUndefined();
    });
  });

  describe('listSalesByDriver', () => {
    it('queries sales scoped to a where clause containing only the given driverName', async () => {
      prisma.sale.findMany.mockResolvedValue([]);

      await service.listSalesByDriver('juan.perez');

      expect(prisma.sale.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.sale.findMany).toHaveBeenCalledWith({
        where: { driverName: 'juan.perez' },
        include: { items: true },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('does not merge any additional caller-supplied filter into the where clause', async () => {
      prisma.sale.findMany.mockResolvedValue([]);

      await service.listSalesByDriver('juan.perez');

      const callArgs = prisma.sale.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(Object.keys(callArgs.where)).toEqual(['driverName']);
    });

    it('scopes strictly to the requested driver, excluding another driver even if present in storage', async () => {
      prisma.sale.findMany.mockResolvedValue([]);

      await service.listSalesByDriver('maria.gomez');

      expect(prisma.sale.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { driverName: 'maria.gomez' } }),
      );
    });

    it('maps prisma sale rows to the same SaleRecord shape as listSales', async () => {
      const now = new Date('2026-01-01T00:00:00.000Z');
      prisma.sale.findMany.mockResolvedValue([
        {
          id: 'sale-1',
          createdAt: now,
          occurredAt: now,
          status: 'active',
          canceledAt: null,
          cancelReason: null,
          driverName: 'juan.perez',
          truckCode: 'CAMION-01',
          total: 100,
          customerName: 'Cliente de prueba',
          customerType: 'final',
          paymentMethod: 'efectivo',
          note: null,
          items: [{ productCode: 'G10', quantity: 2, unitPrice: 50 }],
        },
      ]);

      const result: SaleRecord[] = await service.listSalesByDriver('juan.perez');

      expect(result).toEqual([
        {
          id: 'sale-1',
          createdAt: now.toISOString(),
          occurredAt: now.toISOString(),
          status: 'active',
          canceledAt: undefined,
          cancelReason: undefined,
          driverName: 'juan.perez',
          truckCode: 'CAMION-01',
          total: 100,
          customerName: 'Cliente de prueba',
          customerType: 'final',
          paymentMethod: 'efectivo',
          note: undefined,
          items: [{ productCode: 'G10', quantity: 2, unitPrice: 50 }],
        },
      ]);
    });

    it('orders results newest-first via createdAt desc', async () => {
      prisma.sale.findMany.mockResolvedValue([]);

      await service.listSalesByDriver('juan.perez');

      expect(prisma.sale.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
      );
    });
  });
});
