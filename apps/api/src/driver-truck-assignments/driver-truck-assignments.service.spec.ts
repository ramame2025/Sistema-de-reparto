import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { CreateAssignmentInput } from '@distribuidor/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DriverTruckAssignmentsService } from './driver-truck-assignments.service';

type AssignmentRow = {
  id: string;
  driverId: string;
  truckId: string;
  startDate: Date;
  endDate: Date | null;
  createdAt: Date;
};

function buildAssignmentRow(overrides: Partial<AssignmentRow> = {}): AssignmentRow {
  return {
    id: 'assignment-1',
    driverId: 'driver-1',
    truckId: 'truck-1',
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('DriverTruckAssignmentsService', () => {
  let service: DriverTruckAssignmentsService;
  let prisma: {
    driverTruckAssignment: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      driverTruckAssignment: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      callback(prisma),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        DriverTruckAssignmentsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(DriverTruckAssignmentsService);
  });

  describe('createAssignment', () => {
    it('rejects with ConflictException when the driver already has an overlapping open assignment, creating nothing', async () => {
      const input: CreateAssignmentInput = {
        driverId: 'driver-1',
        truckId: 'truck-2',
        startDate: '2026-02-01T00:00:00.000Z',
      };
      prisma.driverTruckAssignment.findFirst.mockResolvedValueOnce(
        buildAssignmentRow({ driverId: 'driver-1', truckId: 'truck-1', endDate: null }),
      );

      await expect(service.createAssignment(input)).rejects.toThrow(ConflictException);
      expect(prisma.driverTruckAssignment.create).not.toHaveBeenCalled();
    });

    it('rejects with ConflictException when the truck already has an overlapping open assignment with another driver', async () => {
      const input: CreateAssignmentInput = {
        driverId: 'driver-2',
        truckId: 'truck-1',
        startDate: '2026-02-01T00:00:00.000Z',
      };
      prisma.driverTruckAssignment.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(
          buildAssignmentRow({ driverId: 'driver-1', truckId: 'truck-1', endDate: null }),
        );

      await expect(service.createAssignment(input)).rejects.toThrow(ConflictException);
      expect(prisma.driverTruckAssignment.create).not.toHaveBeenCalled();
    });

    it('creates the assignment when neither the driver nor the truck has an overlap', async () => {
      const input: CreateAssignmentInput = {
        driverId: 'driver-3',
        truckId: 'truck-3',
        startDate: '2026-01-11T00:00:00.000Z',
      };
      prisma.driverTruckAssignment.findFirst.mockResolvedValue(null);
      prisma.driverTruckAssignment.create.mockResolvedValue(
        buildAssignmentRow({
          id: 'assignment-3',
          driverId: 'driver-3',
          truckId: 'truck-3',
          startDate: new Date('2026-01-11T00:00:00.000Z'),
        }),
      );

      const result = await service.createAssignment(input);

      expect(prisma.driverTruckAssignment.create).toHaveBeenCalledWith({
        data: {
          driverId: 'driver-3',
          truckId: 'truck-3',
          startDate: new Date('2026-01-11T00:00:00.000Z'),
          endDate: null,
        },
      });
      expect(result.driverId).toBe('driver-3');
      expect(result.endDate).toBeNull();
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('listAssignments', () => {
    it('returns all assignments ordered by startDate descending', async () => {
      prisma.driverTruckAssignment.findMany.mockResolvedValue([
        buildAssignmentRow({ id: 'assignment-2', startDate: new Date('2026-01-11T00:00:00.000Z') }),
      ]);

      const result = await service.listAssignments();

      expect(prisma.driverTruckAssignment.findMany).toHaveBeenCalledWith({
        orderBy: { startDate: 'desc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('assignment-2');
    });
  });

  describe('closeAssignment', () => {
    it('sets endDate on the existing open assignment when no other assignment overlaps', async () => {
      prisma.driverTruckAssignment.findUnique.mockResolvedValue(buildAssignmentRow());
      prisma.driverTruckAssignment.findFirst.mockResolvedValue(null);
      prisma.driverTruckAssignment.update.mockResolvedValue(
        buildAssignmentRow({ endDate: new Date('2026-01-10T00:00:00.000Z') }),
      );

      const result = await service.closeAssignment('assignment-1', '2026-01-10T00:00:00.000Z');

      expect(prisma.driverTruckAssignment.update).toHaveBeenCalledWith({
        where: { id: 'assignment-1' },
        data: { endDate: new Date('2026-01-10T00:00:00.000Z') },
      });
      expect(result.endDate).toBe('2026-01-10T00:00:00.000Z');
    });

    it('throws NotFoundException when the assignment does not exist', async () => {
      prisma.driverTruckAssignment.findUnique.mockResolvedValue(null);

      await expect(
        service.closeAssignment('missing', '2026-01-10T00:00:00.000Z'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.driverTruckAssignment.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when endDate is before startDate', async () => {
      prisma.driverTruckAssignment.findUnique.mockResolvedValue(
        buildAssignmentRow({ startDate: new Date('2026-01-10T00:00:00.000Z') }),
      );

      await expect(
        service.closeAssignment('assignment-1', '2026-01-05T00:00:00.000Z'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.driverTruckAssignment.update).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the new endDate would overlap another assignment for the same truck', async () => {
      // Reproduces: A (driver-1/truck-1) is closed early at Jan5, B (driver-2/truck-1)
      // is created starting Jan10, then A is re-closed at Jan20 — must be rejected,
      // otherwise A and B would silently overlap on truck-1 for the same period.
      prisma.driverTruckAssignment.findUnique.mockResolvedValue(
        buildAssignmentRow({
          id: 'assignment-1',
          driverId: 'driver-1',
          truckId: 'truck-1',
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          endDate: new Date('2026-01-05T00:00:00.000Z'),
        }),
      );
      prisma.driverTruckAssignment.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(
          buildAssignmentRow({
            id: 'assignment-2',
            driverId: 'driver-2',
            truckId: 'truck-1',
            startDate: new Date('2026-01-10T00:00:00.000Z'),
            endDate: null,
          }),
        );

      await expect(
        service.closeAssignment('assignment-1', '2026-01-20T00:00:00.000Z'),
      ).rejects.toThrow(ConflictException);
      expect(prisma.driverTruckAssignment.update).not.toHaveBeenCalled();
      expect(prisma.driverTruckAssignment.findFirst).toHaveBeenLastCalledWith({
        where: {
          id: { not: 'assignment-1' },
          truckId: 'truck-1',
          startDate: { lte: new Date('2026-01-20T00:00:00.000Z') },
          OR: [{ endDate: null }, { endDate: { gte: new Date('2026-01-01T00:00:00.000Z') } }],
        },
      });
    });
  });

  describe('findAssignmentForTruckOnDate', () => {
    it('returns the driver assigned to the truck on the given historical date', async () => {
      // Truck A: driver-1 from Jan 1 to Jan 10, driver-2 from Jan 11 onward.
      // Querying truck A on Jan 5 must resolve to driver-1, not driver-2.
      prisma.driverTruckAssignment.findFirst.mockResolvedValueOnce(
        buildAssignmentRow({
          id: 'assignment-jan1',
          driverId: 'driver-1',
          truckId: 'truck-A',
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          endDate: new Date('2026-01-10T00:00:00.000Z'),
        }),
      );

      const result = await service.findAssignmentForTruckOnDate(
        'truck-A',
        '2026-01-05T00:00:00.000Z',
      );

      expect(prisma.driverTruckAssignment.findFirst).toHaveBeenCalledWith({
        where: {
          truckId: 'truck-A',
          startDate: { lte: new Date('2026-01-05T00:00:00.000Z') },
          OR: [{ endDate: null }, { endDate: { gte: new Date('2026-01-05T00:00:00.000Z') } }],
        },
        orderBy: { startDate: 'desc' },
      });
      expect(result?.driverId).toBe('driver-1');
    });
  });
});
