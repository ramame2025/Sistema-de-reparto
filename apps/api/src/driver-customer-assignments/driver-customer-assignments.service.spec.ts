import { Test } from '@nestjs/testing';
import type { CreateDriverCustomerAssignmentInput } from '@distribuidor/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DriverCustomerAssignmentsService } from './driver-customer-assignments.service';

function buildCustomer(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'customer-1',
    name: 'Kiosco Sur',
    customerType: 'final',
    zone: null,
    latitude: null,
    longitude: null,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function buildAssignment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'assignment-1',
    driverId: 'driver-1',
    date: new Date('2026-08-21T00:00:00.000Z'),
    createdAt: new Date('2026-08-21T00:00:00.000Z'),
    updatedAt: new Date('2026-08-21T00:00:00.000Z'),
    entries: [],
    ...overrides,
  };
}

describe('DriverCustomerAssignmentsService', () => {
  let service: DriverCustomerAssignmentsService;
  let prisma: {
    driverCustomerAssignment: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    driverCustomerAssignmentEntry: {
      deleteMany: jest.Mock;
      createMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      driverCustomerAssignment: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      driverCustomerAssignmentEntry: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      (callback: (tx: unknown) => unknown) => callback(prisma),
    );
    prisma.driverCustomerAssignmentEntry.deleteMany.mockResolvedValue({ count: 0 });
    prisma.driverCustomerAssignmentEntry.createMany.mockResolvedValue({ count: 0 });

    const moduleRef = await Test.createTestingModule({
      providers: [
        DriverCustomerAssignmentsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(DriverCustomerAssignmentsService);
  });

  describe('replaceAssignment', () => {
    it('creates the assignment with entries in the given order on the first save', async () => {
      const input: CreateDriverCustomerAssignmentInput = {
        driverId: 'driver-1',
        date: '2026-08-21',
        customerIds: ['customer-1', 'customer-2', 'customer-3'],
      };
      prisma.driverCustomerAssignment.upsert.mockResolvedValue(buildAssignment());
      prisma.driverCustomerAssignment.findUnique.mockResolvedValue(
        buildAssignment({
          entries: [
            { position: 0, customer: buildCustomer({ id: 'customer-1' }) },
            { position: 1, customer: buildCustomer({ id: 'customer-2' }) },
            { position: 2, customer: buildCustomer({ id: 'customer-3' }) },
          ],
        }),
      );

      const result = await service.replaceAssignment(input);

      expect(prisma.driverCustomerAssignmentEntry.createMany).toHaveBeenCalledWith({
        data: [
          { assignmentId: 'assignment-1', customerId: 'customer-1', position: 0 },
          { assignmentId: 'assignment-1', customerId: 'customer-2', position: 1 },
          { assignmentId: 'assignment-1', customerId: 'customer-3', position: 2 },
        ],
      });
      expect(result.customers.map((c) => c.id)).toEqual([
        'customer-1',
        'customer-2',
        'customer-3',
      ]);
    });

    it('replaces (not duplicates) entries when saving again for the same driver+date', async () => {
      const input: CreateDriverCustomerAssignmentInput = {
        driverId: 'driver-1',
        date: '2026-08-21',
        customerIds: ['customer-2', 'customer-3'],
      };
      prisma.driverCustomerAssignment.upsert.mockResolvedValue(buildAssignment());
      prisma.driverCustomerAssignment.findUnique.mockResolvedValue(
        buildAssignment({
          entries: [
            { position: 0, customer: buildCustomer({ id: 'customer-2' }) },
            { position: 1, customer: buildCustomer({ id: 'customer-3' }) },
          ],
        }),
      );

      await service.replaceAssignment(input);

      // El reemplazo transaccional siempre borra antes de recrear: nunca hay
      // un create sin su deleteMany previo para el mismo assignmentId.
      expect(prisma.driverCustomerAssignmentEntry.deleteMany).toHaveBeenCalledWith({
        where: { assignmentId: 'assignment-1' },
      });
      expect(prisma.driverCustomerAssignmentEntry.createMany).toHaveBeenCalledWith({
        data: [
          { assignmentId: 'assignment-1', customerId: 'customer-2', position: 0 },
          { assignmentId: 'assignment-1', customerId: 'customer-3', position: 1 },
        ],
      });
    });

    it('leaves a valid "no customers assigned" state when customerIds is empty, without calling createMany', async () => {
      const input: CreateDriverCustomerAssignmentInput = {
        driverId: 'driver-1',
        date: '2026-08-21',
        customerIds: [],
      };
      prisma.driverCustomerAssignment.upsert.mockResolvedValue(buildAssignment());
      prisma.driverCustomerAssignment.findUnique.mockResolvedValue(buildAssignment());

      const result = await service.replaceAssignment(input);

      expect(prisma.driverCustomerAssignmentEntry.deleteMany).toHaveBeenCalledWith({
        where: { assignmentId: 'assignment-1' },
      });
      expect(prisma.driverCustomerAssignmentEntry.createMany).not.toHaveBeenCalled();
      expect(result.customers).toEqual([]);
    });
  });

  describe('listAssignmentHistory', () => {
    beforeEach(() => {
      prisma.driverCustomerAssignment.count.mockResolvedValue(0);
      prisma.driverCustomerAssignment.findMany.mockResolvedValue([]);
    });

    it('paginates by 15 and reports normalized page/total metadata', async () => {
      prisma.driverCustomerAssignment.count.mockResolvedValue(63);
      prisma.driverCustomerAssignment.findMany.mockResolvedValue([
        buildAssignment({ id: 'assignment-1' }),
        buildAssignment({ id: 'assignment-2' }),
      ]);

      const result = await service.listAssignmentHistory({ page: 2 });

      expect(prisma.driverCustomerAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 15, take: 15 }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          page: 2,
          pageSize: 15,
          total: 63,
          totalPages: 5,
        }),
      );
      expect(result.items.map((item) => item.id)).toEqual([
        'assignment-1',
        'assignment-2',
      ]);
    });

    it('defaults an absent, zero or negative page to the first page', async () => {
      await service.listAssignmentHistory({});
      await service.listAssignmentHistory({ page: 0 });
      await service.listAssignmentHistory({ page: -4 });

      for (let nth = 1; nth <= 3; nth += 1) {
        expect(prisma.driverCustomerAssignment.findMany).toHaveBeenNthCalledWith(
          nth,
          expect.objectContaining({ skip: 0, take: 15 }),
        );
      }
    });

    it('reports at least one page even when the history is empty', async () => {
      prisma.driverCustomerAssignment.count.mockResolvedValue(0);

      const result = await service.listAssignmentHistory({});

      expect(result.totalPages).toBe(1);
      expect(result.items).toEqual([]);
    });

    it('builds a where clause from driver, inclusive date range and customer filters', async () => {
      await service.listAssignmentHistory({
        driverId: 'driver-1',
        from: '2026-08-01',
        to: '2026-08-31',
        customerId: 'customer-2',
      });

      const expectedWhere = {
        driverId: 'driver-1',
        date: {
          gte: new Date('2026-08-01T00:00:00.000Z'),
          lte: new Date('2026-08-31T00:00:00.000Z'),
        },
        entries: { some: { customerId: 'customer-2' } },
      };
      expect(prisma.driverCustomerAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expectedWhere }),
      );
      // El count usa exactamente el mismo filtro que la pagina.
      expect(prisma.driverCustomerAssignment.count).toHaveBeenCalledWith({
        where: expectedWhere,
      });
    });

    it('omits every unset filter from the where clause', async () => {
      await service.listAssignmentHistory({});

      expect(prisma.driverCustomerAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('orders newest day first', async () => {
      await service.listAssignmentHistory({});

      expect(prisma.driverCustomerAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        }),
      );
    });
  });

  describe('getMyAssignment', () => {
    it('returns an empty array (not an error) when nothing is assigned that day', async () => {
      prisma.driverCustomerAssignment.findUnique.mockResolvedValue(null);

      const result = await service.getMyAssignment('driver-1', '2026-08-21');

      expect(result).toEqual([]);
    });

    it('resolves to fully-joined customers, preserving assigned order', async () => {
      prisma.driverCustomerAssignment.findUnique.mockResolvedValue(
        buildAssignment({
          entries: [
            { position: 0, customer: buildCustomer({ id: 'customer-1', name: 'A' }) },
            { position: 1, customer: buildCustomer({ id: 'customer-2', name: 'B' }) },
          ],
        }),
      );

      const result = await service.getMyAssignment('driver-1', '2026-08-21');

      expect(result.map((c) => c.id)).toEqual(['customer-1', 'customer-2']);
    });
  });
});
