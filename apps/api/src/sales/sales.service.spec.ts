import { Test, TestingModule } from '@nestjs/testing';
import type { SaleRecord } from '@distribuidor/shared';
import { SalesService } from './sales.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SalesService', () => {
  let service: SalesService;
  let prisma: { sale: { findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      sale: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SalesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<SalesService>(SalesService);
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
          items: [{ productCode: 'G10', quantity: 2 }],
        },
      ]);

      const result: SaleRecord[] = await service.listSalesByDriver('juan.perez');

      expect(result).toEqual([
        {
          id: 'sale-1',
          createdAt: now.toISOString(),
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
          items: [{ productCode: 'G10', quantity: 2 }],
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
