import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { CreateSaleInput, PriceTable, UpdateSaleInput } from '@distribuidor/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PricesService } from '../prices/prices.service';
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
    items: [{ productCode: 'G10', quantity: 2 }],
    ...overrides,
  };
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

describe('SalesService', () => {
  let service: SalesService;
  let prisma: {
    sale: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    saleItem: { deleteMany: jest.Mock };
    saleAudit: { create: jest.Mock };
    customer: { findUnique: jest.Mock };
    truck: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let pricesService: { getPriceTable: jest.Mock };

  beforeEach(async () => {
    prisma = {
      sale: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      saleItem: { deleteMany: jest.fn() },
      saleAudit: { create: jest.fn() },
      customer: { findUnique: jest.fn() },
      truck: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };
    pricesService = { getPriceTable: jest.fn().mockResolvedValue(CUSTOM_PRICE_TABLE) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: PrismaService, useValue: prisma },
        { provide: PricesService, useValue: pricesService },
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

    it('computes the total from PricesService.getPriceTable, not DEFAULT_PRICE_TABLE', async () => {
      prisma.sale.create.mockResolvedValue(buildSaleRow({ total: 400 }));

      await service.createSale(
        buildCreateInput({ items: [{ productCode: 'G15_AUTO', quantity: 1 }] }),
      );

      expect(pricesService.getPriceTable).toHaveBeenCalledTimes(1);
      // DEFAULT_PRICE_TABLE.final.G15_AUTO is 14500; CUSTOM_PRICE_TABLE.final.G15_AUTO is 400.
      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ total: 400 }) }),
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

    it('computes the total from PricesService.getPriceTable, not DEFAULT_PRICE_TABLE', async () => {
      prisma.sale.update.mockResolvedValue(buildSaleRow({ total: 400 }));

      await service.updateSale(
        'sale-1',
        buildUpdateInput({ items: [{ productCode: 'G15_AUTO', quantity: 1 }] }),
      );

      expect(pricesService.getPriceTable).toHaveBeenCalledTimes(1);
      expect(prisma.sale.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ total: 400 }) }),
      );
    });
  });
});
