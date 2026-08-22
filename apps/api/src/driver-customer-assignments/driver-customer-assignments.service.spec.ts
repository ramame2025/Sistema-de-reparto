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
