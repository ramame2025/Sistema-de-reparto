import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { CreateTruckInput } from '@distribuidor/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { TrucksService } from './trucks.service';

type TruckRow = {
  id: string;
  code: string;
  plate: string;
  capacities: { productCode: string; units: number }[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function buildTruckRow(overrides: Partial<TruckRow> = {}): TruckRow {
  return {
    id: 'truck-1',
    code: 'T-01',
    plate: 'AB123CD',
    capacities: [],
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

/**
 * La grilla se lee ordenada por el `sortOrder` del producto, y ese orden lo
 * resuelve Prisma. Pedirlo es lo que se verifica; que lo cumpla es del motor.
 */
const CAPACITIES_INCLUDE_WRAPPER = { include: {
  capacities: {
    select: { productCode: true, units: true },
    orderBy: [{ product: { sortOrder: 'asc' } }, { productCode: 'asc' }],
  },
} };

describe('TrucksService', () => {
  let service: TrucksService;
  let prisma: {
    truck: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    truckCapacity: {
      deleteMany: jest.Mock;
      createMany: jest.Mock;
    };
    driverTruckAssignment: {
      findMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let productsService: { assertProductCodesExist: jest.Mock };

  beforeEach(async () => {
    prisma = {
      truck: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      truckCapacity: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      driverTruckAssignment: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn((run: (tx: unknown) => unknown) => run(prisma)),
    };
    productsService = { assertProductCodesExist: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TrucksService,
        { provide: PrismaService, useValue: prisma },
        { provide: ProductsService, useValue: productsService },
      ],
    }).compile();

    service = moduleRef.get(TrucksService);
  });

  describe('createTruck', () => {
    // La capacidad ya no se carga junto al codigo y la patente: nace vacia y
    // se completa despues con PUT /trucks/:id/capacities.
    it('creates the truck with an empty capacity grid', async () => {
      const input: CreateTruckInput = {
        code: 'T-01',
        plate: 'AB123CD',
      };
      prisma.truck.create.mockResolvedValue(buildTruckRow());

      const result = await service.createTruck(input);

      expect(prisma.truck.create).toHaveBeenCalledWith({
        data: {
          code: 'T-01',
          plate: 'AB123CD',
          isActive: true,
        },
        ...CAPACITIES_INCLUDE_WRAPPER,
      });
      expect(result.capacities).toEqual([]);
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
        ...CAPACITIES_INCLUDE_WRAPPER,
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

      expect(prisma.truck.findUnique).toHaveBeenCalledWith({
        where: { id: 'truck-1' },
        ...CAPACITIES_INCLUDE_WRAPPER,
      });
      expect(result.code).toBe('T-01');
    });

    it('returns the per-product grid the truck has stored', async () => {
      prisma.truck.findUnique.mockResolvedValue(
        buildTruckRow({
          capacities: [
            { productCode: 'G10', units: 30 },
            { productCode: 'G45', units: 0 },
          ],
        }),
      );

      const result = await service.getTruck('truck-1');

      // `units: 0` sobrevive: es "este producto no viaja aca", no una fila
      // vacia que se pueda descartar.
      expect(result.capacities).toEqual([
        { productCode: 'G10', units: 30 },
        { productCode: 'G45', units: 0 },
      ]);
    });

    it('throws NotFoundException when the truck does not exist', async () => {
      prisma.truck.findUnique.mockResolvedValue(null);

      await expect(service.getTruck('ghost')).rejects.toThrow(NotFoundException);
    });
  });
  describe('updateTruck', () => {
    it('updates only the fields present in the payload', async () => {
      prisma.truck.findUnique.mockResolvedValue(buildTruckRow());
      prisma.truck.update.mockResolvedValue(buildTruckRow({ code: 'T-09' }));

      const result = await service.updateTruck('truck-1', { code: 'T-09' });

      expect(prisma.truck.update).toHaveBeenCalledWith({
        where: { id: 'truck-1' },
        data: { code: 'T-09' },
        ...CAPACITIES_INCLUDE_WRAPPER,
      });
      expect(result.code).toBe('T-09');
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
        ...CAPACITIES_INCLUDE_WRAPPER,
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
        ...CAPACITIES_INCLUDE_WRAPPER,
      });
    });

    it('throws NotFoundException when the truck does not exist', async () => {
      prisma.truck.findUnique.mockResolvedValue(null);

      await expect(service.updateTruck('ghost', { code: 'T-09' })).rejects.toThrow(
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
        ...CAPACITIES_INCLUDE_WRAPPER,
      });
    });

    it('includes de-activated trucks when asked, so they can be reactivated', async () => {
      prisma.truck.findMany.mockResolvedValue([]);

      await service.listTrucks(true);

      expect(prisma.truck.findMany).toHaveBeenCalledWith({
        orderBy: { code: 'asc' },
        ...CAPACITIES_INCLUDE_WRAPPER,
      });
    });

    it('reads the grid ordered by the product sortOrder, like the rest of the catalogue', async () => {
      prisma.truck.findMany.mockResolvedValue([]);

      await service.listTrucks();

      const [[args]] = prisma.truck.findMany.mock.calls;
      expect(args.include.capacities.orderBy).toEqual([
        { product: { sortOrder: 'asc' } },
        { productCode: 'asc' },
      ]);
    });
  });

  describe('setCapacities', () => {
    beforeEach(() => {
      prisma.truck.findUnique.mockResolvedValue(buildTruckRow());
    });

    it('replaces the whole grid in one transaction instead of merging it', async () => {
      // Reemplazo total, igual que DriverCustomerAssignment: con un merge
      // "sacar este producto del camion" no se podria expresar.
      await service.setCapacities('truck-1', {
        capacities: [
          { productCode: 'G10', units: 30 },
          { productCode: 'G45', units: 12 },
        ],
      });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.truckCapacity.deleteMany).toHaveBeenCalledWith({
        where: { truckId: 'truck-1' },
      });
      expect(prisma.truckCapacity.createMany).toHaveBeenCalledWith({
        data: [
          { truckId: 'truck-1', productCode: 'G10', units: 30 },
          { truckId: 'truck-1', productCode: 'G45', units: 12 },
        ],
      });
    });

    it('stores a units of 0 instead of silently dropping the row', async () => {
      await service.setCapacities('truck-1', {
        capacities: [{ productCode: 'G45', units: 0 }],
      });

      expect(prisma.truckCapacity.createMany).toHaveBeenCalledWith({
        data: [{ truckId: 'truck-1', productCode: 'G45', units: 0 }],
      });
    });

    it('empties the grid back to "sin detallar" without creating any row', async () => {
      await service.setCapacities('truck-1', { capacities: [] });

      expect(prisma.truckCapacity.deleteMany).toHaveBeenCalledWith({
        where: { truckId: 'truck-1' },
      });
      expect(prisma.truckCapacity.createMany).not.toHaveBeenCalled();
    });

    it('asserts every productCode exists before writing anything', async () => {
      productsService.assertProductCodesExist.mockRejectedValue(
        new BadRequestException('Unknown productCode: GHOST'),
      );

      await expect(
        service.setCapacities('truck-1', {
          capacities: [{ productCode: 'GHOST', units: 1 }],
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.truckCapacity.deleteMany).not.toHaveBeenCalled();
      expect(prisma.truckCapacity.createMany).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a truck that does not exist', async () => {
      prisma.truck.findUnique.mockResolvedValue(null);

      await expect(
        service.setCapacities('ghost', { capacities: [] }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.truckCapacity.deleteMany).not.toHaveBeenCalled();
    });

    it('returns the truck with the grid it just stored', async () => {
      prisma.truck.findUnique
        .mockResolvedValueOnce(buildTruckRow())
        .mockResolvedValueOnce(
          buildTruckRow({ capacities: [{ productCode: 'G10', units: 30 }] }),
        );

      const result = await service.setCapacities('truck-1', {
        capacities: [{ productCode: 'G10', units: 30 }],
      });

      expect(result.capacities).toEqual([{ productCode: 'G10', units: 30 }]);
    });
  });
});
