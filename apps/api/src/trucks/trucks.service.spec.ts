import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { CreateTruckInput } from '@distribuidor/shared';
import { PrismaService } from '../prisma/prisma.service';
import { TrucksService } from './trucks.service';

type TruckRow = {
  id: string;
  code: string;
  plate: string;
  capacity: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function buildTruckRow(overrides: Partial<TruckRow> = {}): TruckRow {
  return {
    id: 'truck-1',
    code: 'T-01',
    plate: 'AB123CD',
    capacity: 40,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('TrucksService', () => {
  let service: TrucksService;
  let prisma: {
    truck: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    driverTruckAssignment: {
      findMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      truck: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      driverTruckAssignment: {
        findMany: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TrucksService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(TrucksService);
  });

  describe('createTruck', () => {
    it('stores capacity as a non-negative integer', async () => {
      const input: CreateTruckInput = {
        code: 'T-01',
        plate: 'AB123CD',
        capacity: 40,
      };
      const created = buildTruckRow({ capacity: 40 });
      prisma.truck.create.mockResolvedValue(created);

      const result = await service.createTruck(input);

      expect(prisma.truck.create).toHaveBeenCalledWith({
        data: {
          code: 'T-01',
          plate: 'AB123CD',
          capacity: 40,
          isActive: true,
        },
      });
      expect(result.capacity).toBe(40);
      expect(Number.isInteger(result.capacity)).toBe(true);
    });

    it('stores a different non-negative integer capacity for a second truck', async () => {
      const input: CreateTruckInput = {
        code: 'T-02',
        plate: 'XY987ZW',
        capacity: 12,
      };
      const created = buildTruckRow({ id: 'truck-2', code: 'T-02', plate: 'XY987ZW', capacity: 12 });
      prisma.truck.create.mockResolvedValue(created);

      const result = await service.createTruck(input);

      expect(prisma.truck.create).toHaveBeenCalledWith({
        data: {
          code: 'T-02',
          plate: 'XY987ZW',
          capacity: 12,
          isActive: true,
        },
      });
      expect(result.capacity).toBe(12);
    });
  });

  describe('listTrucks', () => {
    it('excludes inactive trucks from the result', async () => {
      prisma.truck.findMany.mockResolvedValue([
        buildTruckRow({ id: 'truck-active', isActive: true }),
      ]);

      const result = await service.listTrucks();

      expect(prisma.truck.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { code: 'asc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('truck-active');
    });
  });

  describe('deactivateTruck', () => {
    it('flips isActive to false without deleting the record', async () => {
      prisma.truck.findUnique.mockResolvedValue(buildTruckRow());
      prisma.truck.update.mockResolvedValue(buildTruckRow({ isActive: false }));

      await service.deactivateTruck('truck-1');

      expect(prisma.truck.update).toHaveBeenCalledWith({
        where: { id: 'truck-1' },
        data: { isActive: false },
      });
    });

    it('leaves an existing DriverTruckAssignment referencing this truck untouched', async () => {
      prisma.truck.findUnique.mockResolvedValue(buildTruckRow());
      prisma.truck.update.mockResolvedValue(buildTruckRow({ isActive: false }));

      await service.deactivateTruck('truck-1');

      expect(prisma.driverTruckAssignment.findMany).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the truck does not exist', async () => {
      prisma.truck.findUnique.mockResolvedValue(null);

      await expect(service.deactivateTruck('missing')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.truck.update).not.toHaveBeenCalled();
    });
  });
  describe('getTruck', () => {
    it('returns the truck when it exists', async () => {
      prisma.truck.findUnique.mockResolvedValue(buildTruckRow());

      const result = await service.getTruck('truck-1');

      expect(prisma.truck.findUnique).toHaveBeenCalledWith({ where: { id: 'truck-1' } });
      expect(result.code).toBe('T-01');
      expect(result.capacity).toBe(40);
    });

    it('throws NotFoundException when the truck does not exist', async () => {
      prisma.truck.findUnique.mockResolvedValue(null);

      await expect(service.getTruck('ghost')).rejects.toThrow(NotFoundException);
    });
  });
  describe('updateTruck', () => {
    it('updates only the fields present in the payload', async () => {
      prisma.truck.findUnique.mockResolvedValue(buildTruckRow());
      prisma.truck.update.mockResolvedValue(buildTruckRow({ capacity: 45 }));

      const result = await service.updateTruck('truck-1', { capacity: 45 });

      expect(prisma.truck.update).toHaveBeenCalledWith({
        where: { id: 'truck-1' },
        data: { capacity: 45 },
      });
      expect(result.capacity).toBe(45);
    });

    it('can reactivate a truck that was given de baja', async () => {
      // Sin esto una baja es irreversible: el camion desaparece de la lista
      // y no hay forma de volver a habilitarlo.
      prisma.truck.findUnique.mockResolvedValue(buildTruckRow({ isActive: false }));
      prisma.truck.update.mockResolvedValue(buildTruckRow({ isActive: true }));

      const result = await service.updateTruck('truck-1', { isActive: true });

      expect(prisma.truck.update).toHaveBeenCalledWith({
        where: { id: 'truck-1' },
        data: { isActive: true },
      });
      expect(result.isActive).toBe(true);
    });

    it('does not send absent fields, so a partial update never blanks the rest', async () => {
      prisma.truck.findUnique.mockResolvedValue(buildTruckRow());
      prisma.truck.update.mockResolvedValue(buildTruckRow());

      await service.updateTruck('truck-1', { plate: ' XY999ZZ ' });

      expect(prisma.truck.update).toHaveBeenCalledWith({
        where: { id: 'truck-1' },
        data: { plate: 'XY999ZZ' },
      });
    });

    it('throws NotFoundException when the truck does not exist', async () => {
      prisma.truck.findUnique.mockResolvedValue(null);

      await expect(service.updateTruck('ghost', { capacity: 1 })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.truck.update).not.toHaveBeenCalled();
    });

    it('translates a unique-constraint collision into ConflictException', async () => {
      prisma.truck.findUnique.mockResolvedValue(buildTruckRow());
      prisma.truck.update.mockRejectedValue({ code: 'P2002' });

      await expect(service.updateTruck('truck-1', { code: 'T-02' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('listTrucks', () => {
    it('lists only active trucks by default', async () => {
      prisma.truck.findMany.mockResolvedValue([]);

      await service.listTrucks();

      expect(prisma.truck.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { code: 'asc' },
      });
    });

    it('includes de-activated trucks when asked, so they can be reactivated', async () => {
      prisma.truck.findMany.mockResolvedValue([]);

      await service.listTrucks(true);

      expect(prisma.truck.findMany).toHaveBeenCalledWith({
        orderBy: { code: 'asc' },
      });
    });
  });
});
