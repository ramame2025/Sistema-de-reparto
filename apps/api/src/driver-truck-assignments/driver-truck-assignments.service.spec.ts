import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { CreateAssignmentInput } from '@distribuidor/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DriverTruckAssignmentsService } from './driver-truck-assignments.service';

type AssignmentRow = {
  id: string;
  driverId: string;
  truckId: string;
  kind: 'titular' | 'cobertura';
  startDate: Date;
  endDate: Date | null;
  createdAt: Date;
};

function buildAssignmentRow(
  overrides: Partial<AssignmentRow> = {},
): AssignmentRow {
  return {
    id: 'assignment-1',
    driverId: 'driver-1',
    truckId: 'truck-1',
    kind: 'titular',
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
    truck: { findUnique: jest.Mock };
    userAccount: { findUnique: jest.Mock };
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
      truck: { findUnique: jest.fn() },
      userAccount: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };
    // Por defecto el chofer existe y tiene el rol correcto; los tests que
    // prueban lo contrario lo sobreescriben.
    prisma.userAccount.findUnique.mockResolvedValue({
      id: 'driver-1',
      role: 'chofer',
    });
    prisma.$transaction.mockImplementation(
      (callback: (tx: unknown) => unknown) => callback(prisma),
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
        kind: 'titular',
        startDate: '2026-02-01T00:00:00.000Z',
      };
      prisma.driverTruckAssignment.findFirst.mockResolvedValueOnce(
        buildAssignmentRow({
          driverId: 'driver-1',
          truckId: 'truck-1',
          endDate: null,
        }),
      );

      await expect(service.createAssignment(input)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.driverTruckAssignment.create).not.toHaveBeenCalled();
    });

    it('rejects with ConflictException when the truck already has an overlapping open assignment with another driver', async () => {
      const input: CreateAssignmentInput = {
        driverId: 'driver-2',
        truckId: 'truck-1',
        kind: 'titular',
        startDate: '2026-02-01T00:00:00.000Z',
      };
      prisma.driverTruckAssignment.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(
          buildAssignmentRow({
            driverId: 'driver-1',
            truckId: 'truck-1',
            endDate: null,
          }),
        );

      await expect(service.createAssignment(input)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.driverTruckAssignment.create).not.toHaveBeenCalled();
    });

    it('creates the assignment when neither the driver nor the truck has an overlap', async () => {
      const input: CreateAssignmentInput = {
        driverId: 'driver-3',
        truckId: 'truck-3',
        kind: 'titular',
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
          kind: 'titular',
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
        buildAssignmentRow({
          id: 'assignment-2',
          startDate: new Date('2026-01-11T00:00:00.000Z'),
        }),
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
      prisma.driverTruckAssignment.findUnique.mockResolvedValue(
        buildAssignmentRow(),
      );
      prisma.driverTruckAssignment.findFirst.mockResolvedValue(null);
      prisma.driverTruckAssignment.update.mockResolvedValue(
        buildAssignmentRow({ endDate: new Date('2026-01-10T00:00:00.000Z') }),
      );

      const result = await service.closeAssignment(
        'assignment-1',
        '2026-01-10T00:00:00.000Z',
      );

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
          // Cerrar un titular solo puede chocar contra otro titular: una
          // cobertura dentro del rango es legitima, lo pisa y no lo invalida.
          kind: 'titular',
          startDate: { lte: new Date('2026-01-20T00:00:00.000Z') },
          OR: [
            { endDate: null },
            { endDate: { gte: new Date('2026-01-01T00:00:00.000Z') } },
          ],
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
          OR: [
            { endDate: null },
            { endDate: { gte: new Date('2026-01-05T00:00:00.000Z') } },
          ],
        },
        orderBy: { startDate: 'desc' },
      });
      expect(result?.driverId).toBe('driver-1');
    });
  });
  describe('createAssignment - regla de override (cobertura pisa titular)', () => {
    const cobertura: CreateAssignmentInput = {
      driverId: 'driver-2',
      truckId: 'truck-1',
      kind: 'cobertura',
      startDate: '2026-02-10T00:00:00.000Z',
      endDate: '2026-02-12T00:00:00.000Z',
    };

    it('allows a cobertura over an open titular on the same truck', async () => {
      // Juan es titular abierto del truck-1. Falta 3 dias y lo cubre Pedro:
      // esto DEBE poder cargarse sin tocar la asignacion de Juan.
      prisma.userAccount.findUnique.mockResolvedValue({
        id: 'driver-2',
        role: 'chofer',
      });
      prisma.driverTruckAssignment.findFirst.mockResolvedValue(null);
      prisma.driverTruckAssignment.create.mockResolvedValue(
        buildAssignmentRow({
          id: 'cover-1',
          driverId: 'driver-2',
          kind: 'cobertura',
          startDate: new Date('2026-02-10T00:00:00.000Z'),
          endDate: new Date('2026-02-12T00:00:00.000Z'),
        }),
      );

      const result = await service.createAssignment(cobertura);

      expect(result.kind).toBe('cobertura');
      // La busqueda de conflicto se acota al MISMO tipo: una cobertura nunca
      // se compara contra un titular.
      expect(prisma.driverTruckAssignment.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({ kind: 'cobertura' }),
      });
    });

    it('rejects a second cobertura overlapping the same truck on the same days', async () => {
      prisma.userAccount.findUnique.mockResolvedValue({
        id: 'driver-2',
        role: 'chofer',
      });
      prisma.driverTruckAssignment.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(
          buildAssignmentRow({
            id: 'cover-existing',
            driverId: 'driver-3',
            kind: 'cobertura',
            startDate: new Date('2026-02-11T00:00:00.000Z'),
            endDate: new Date('2026-02-13T00:00:00.000Z'),
          }),
        );

      await expect(service.createAssignment(cobertura)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.driverTruckAssignment.create).not.toHaveBeenCalled();
    });

    it('allows a new open titular even when a future cobertura already exists', async () => {
      // La cobertura futura sigue valiendo y pisara al titular esos dias.
      prisma.userAccount.findUnique.mockResolvedValue({
        id: 'driver-9',
        role: 'chofer',
      });
      prisma.driverTruckAssignment.findFirst.mockResolvedValue(null);
      prisma.driverTruckAssignment.create.mockResolvedValue(
        buildAssignmentRow({
          id: 'tit-9',
          driverId: 'driver-9',
          kind: 'titular',
        }),
      );

      await service.createAssignment({
        driverId: 'driver-9',
        truckId: 'truck-1',
        kind: 'titular',
        startDate: '2026-02-01T00:00:00.000Z',
      });

      expect(prisma.driverTruckAssignment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ kind: 'titular', endDate: null }),
      });
    });
  });

  describe('createAssignment - validacion del chofer', () => {
    it('throws NotFoundException when the driver does not exist', async () => {
      prisma.userAccount.findUnique.mockResolvedValue(null);

      await expect(
        service.createAssignment({
          driverId: 'ghost',
          truckId: 'truck-1',
          kind: 'titular',
          startDate: '2026-02-01T00:00:00.000Z',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.driverTruckAssignment.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the user is an admin, not a chofer', async () => {
      // Un camion se le asigna a quien maneja. Un admin no maneja.
      prisma.userAccount.findUnique.mockResolvedValue({
        id: 'admin-1',
        role: 'admin',
      });

      await expect(
        service.createAssignment({
          driverId: 'admin-1',
          truckId: 'truck-1',
          kind: 'titular',
          startDate: '2026-02-01T00:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.driverTruckAssignment.create).not.toHaveBeenCalled();
    });
  });

  describe('resolveEffectiveDays', () => {
    it('projects day by day, letting the cobertura win over the open titular', async () => {
      prisma.driverTruckAssignment.findMany.mockResolvedValue([
        buildAssignmentRow({
          id: 'tit-1',
          driverId: 'juan',
          kind: 'titular',
          startDate: new Date('2026-02-01T00:00:00.000Z'),
          endDate: null,
        }),
        buildAssignmentRow({
          id: 'cov-1',
          driverId: 'pedro',
          kind: 'cobertura',
          startDate: new Date('2026-02-03T00:00:00.000Z'),
          endDate: new Date('2026-02-04T00:00:00.000Z'),
        }),
      ]);

      const days = await service.resolveEffectiveDays(
        'truck-1',
        '2026-02-02',
        '2026-02-05',
      );

      expect(days).toEqual([
        {
          date: '2026-02-02',
          driverId: 'juan',
          assignmentId: 'tit-1',
          kind: 'titular',
        },
        {
          date: '2026-02-03',
          driverId: 'pedro',
          assignmentId: 'cov-1',
          kind: 'cobertura',
        },
        {
          date: '2026-02-04',
          driverId: 'pedro',
          assignmentId: 'cov-1',
          kind: 'cobertura',
        },
        {
          date: '2026-02-05',
          driverId: 'juan',
          assignmentId: 'tit-1',
          kind: 'titular',
        },
      ]);
    });

    it('reports days with nobody assigned as null instead of skipping them', async () => {
      prisma.driverTruckAssignment.findMany.mockResolvedValue([
        buildAssignmentRow({
          id: 'tit-1',
          driverId: 'juan',
          kind: 'titular',
          startDate: new Date('2026-02-04T00:00:00.000Z'),
          endDate: null,
        }),
      ]);

      const days = await service.resolveEffectiveDays(
        'truck-1',
        '2026-02-03',
        '2026-02-04',
      );

      expect(days).toEqual([
        { date: '2026-02-03', driverId: null, assignmentId: null, kind: null },
        {
          date: '2026-02-04',
          driverId: 'juan',
          assignmentId: 'tit-1',
          kind: 'titular',
        },
      ]);
    });
  });

  describe('resolveAssignmentForDriverOnDate', () => {
    it('returns the cobertura when the driver has both a titular and a cobertura that day', async () => {
      // Es el dato que la app del chofer necesita: que camion maneja HOY.
      prisma.driverTruckAssignment.findMany.mockResolvedValue([
        buildAssignmentRow({
          id: 'tit-1',
          driverId: 'pedro',
          truckId: 'truck-2',
          kind: 'titular',
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          endDate: null,
        }),
        buildAssignmentRow({
          id: 'cov-1',
          driverId: 'pedro',
          truckId: 'truck-1',
          kind: 'cobertura',
          startDate: new Date('2026-02-10T00:00:00.000Z'),
          endDate: new Date('2026-02-12T00:00:00.000Z'),
        }),
      ]);

      const result = await service.resolveAssignmentForDriverOnDate(
        'pedro',
        '2026-02-11',
      );

      expect(result?.truckId).toBe('truck-1');
      expect(result?.kind).toBe('cobertura');
    });

    it('returns the titular when no cobertura covers that day', async () => {
      prisma.driverTruckAssignment.findMany.mockResolvedValue([
        buildAssignmentRow({
          id: 'tit-1',
          driverId: 'pedro',
          truckId: 'truck-2',
          kind: 'titular',
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          endDate: null,
        }),
      ]);

      const result = await service.resolveAssignmentForDriverOnDate(
        'pedro',
        '2026-02-20',
      );

      expect(result?.truckId).toBe('truck-2');
      expect(result?.kind).toBe('titular');
    });

    it('returns null when the driver has no truck that day', async () => {
      prisma.driverTruckAssignment.findMany.mockResolvedValue([]);

      const result = await service.resolveAssignmentForDriverOnDate(
        'pedro',
        '2026-02-20',
      );

      expect(result).toBeNull();
    });
  });

  describe('previewAssignment', () => {
    it('warns that the cobertura leaves the driver own truck without anyone', async () => {
      // Desde el calendario del truck-1 no se ve que Pedro es titular del
      // truck-2: si no avisamos, el truck-2 queda sin chofer y nadie se entera.
      prisma.userAccount.findUnique.mockResolvedValue({
        id: 'pedro',
        role: 'chofer',
      });
      prisma.driverTruckAssignment.findMany.mockResolvedValue([
        buildAssignmentRow({
          id: 'tit-2',
          driverId: 'pedro',
          truckId: 'truck-2',
          kind: 'titular',
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          endDate: null,
        }),
      ]);

      const warnings = await service.previewAssignment({
        driverId: 'pedro',
        truckId: 'truck-1',
        kind: 'cobertura',
        startDate: '2026-02-10T00:00:00.000Z',
        endDate: '2026-02-12T00:00:00.000Z',
      });

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatchObject({
        code: 'driver_leaves_own_truck',
        truckId: 'truck-2',
      });
    });

    it('returns no warnings when the driver has no other truck in that range', async () => {
      prisma.userAccount.findUnique.mockResolvedValue({
        id: 'pedro',
        role: 'chofer',
      });
      prisma.driverTruckAssignment.findMany.mockResolvedValue([]);

      const warnings = await service.previewAssignment({
        driverId: 'pedro',
        truckId: 'truck-1',
        kind: 'cobertura',
        startDate: '2026-02-10T00:00:00.000Z',
        endDate: '2026-02-12T00:00:00.000Z',
      });

      expect(warnings).toEqual([]);
    });
  });
  describe('getTruckCalendar', () => {
    it('returns both layers: the raw rows to edit and the day-by-day projection to paint', async () => {
      // Dos filas, cuatro dias. Pintar el calendario NO es listar las filas.
      prisma.driverTruckAssignment.findMany.mockResolvedValue([
        buildAssignmentRow({
          id: 'tit-1',
          driverId: 'juan',
          kind: 'titular',
          startDate: new Date('2026-02-01T00:00:00.000Z'),
          endDate: null,
        }),
        buildAssignmentRow({
          id: 'cov-1',
          driverId: 'pedro',
          kind: 'cobertura',
          startDate: new Date('2026-02-03T00:00:00.000Z'),
          endDate: new Date('2026-02-03T00:00:00.000Z'),
        }),
      ]);

      const calendar = await service.getTruckCalendar('truck-1', '2026-02-02', '2026-02-04');

      expect(calendar.truckId).toBe('truck-1');
      expect(calendar.from).toBe('2026-02-02');
      expect(calendar.to).toBe('2026-02-04');
      expect(calendar.assignments.map((a) => a.id)).toEqual(['tit-1', 'cov-1']);
      expect(calendar.days).toEqual([
        { date: '2026-02-02', driverId: 'juan', assignmentId: 'tit-1', kind: 'titular' },
        { date: '2026-02-03', driverId: 'pedro', assignmentId: 'cov-1', kind: 'cobertura' },
        { date: '2026-02-04', driverId: 'juan', assignmentId: 'tit-1', kind: 'titular' },
      ]);
    });

    it('hits the database once, not once per day', async () => {
      prisma.driverTruckAssignment.findMany.mockResolvedValue([]);

      await service.getTruckCalendar('truck-1', '2026-02-01', '2026-02-28');

      expect(prisma.driverTruckAssignment.findMany).toHaveBeenCalledTimes(1);
    });

    it('rejects a window longer than a year instead of building a huge array', async () => {
      // La proyeccion recorre dia por dia: sin tope, from=1900&to=2100 arma
      // 73.000 entradas en memoria.
      await expect(
        service.getTruckCalendar('truck-1', '2026-01-01', '2027-06-01'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.driverTruckAssignment.findMany).not.toHaveBeenCalled();
    });

    it('rejects a window where `to` is before `from`', async () => {
      await expect(
        service.getTruckCalendar('truck-1', '2026-02-10', '2026-02-01'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.driverTruckAssignment.findMany).not.toHaveBeenCalled();
    });
  });
  describe('resolveMyTruckForDate', () => {
    it('returns the truck the driver actually drives that day, with its capacity', async () => {
      prisma.driverTruckAssignment.findMany.mockResolvedValue([
        buildAssignmentRow({
          id: 'tit-1',
          driverId: 'pedro',
          truckId: 'truck-2',
          kind: 'titular',
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          endDate: null,
        }),
        buildAssignmentRow({
          id: 'cov-1',
          driverId: 'pedro',
          truckId: 'truck-1',
          kind: 'cobertura',
          startDate: new Date('2026-02-10T00:00:00.000Z'),
          endDate: new Date('2026-02-12T00:00:00.000Z'),
        }),
      ]);
      prisma.truck.findUnique.mockResolvedValue({
        id: 'truck-1',
        code: 'T-01',
        plate: 'AB123CD',
        capacity: 40,
        isActive: true,
      });

      const result = await service.resolveMyTruckForDate('pedro', '2026-02-11');

      // Ese dia Pedro cubre el truck-1, no maneja su titular truck-2.
      expect(prisma.truck.findUnique).toHaveBeenCalledWith({ where: { id: 'truck-1' } });
      expect(result).toMatchObject({
        truckId: 'truck-1',
        code: 'T-01',
        capacity: 40,
        kind: 'cobertura',
      });
    });

    it('returns null when the driver has no truck that day', async () => {
      prisma.driverTruckAssignment.findMany.mockResolvedValue([]);

      const result = await service.resolveMyTruckForDate('pedro', '2026-02-11');

      expect(result).toBeNull();
      expect(prisma.truck.findUnique).not.toHaveBeenCalled();
    });

    it('returns null when the assigned truck was deactivated', async () => {
      // Un camion dado de baja no puede seguir habilitando ventas.
      prisma.driverTruckAssignment.findMany.mockResolvedValue([
        buildAssignmentRow({ driverId: 'pedro', truckId: 'truck-1', kind: 'titular' }),
      ]);
      prisma.truck.findUnique.mockResolvedValue({
        id: 'truck-1',
        code: 'T-01',
        plate: 'AB123CD',
        capacity: 40,
        isActive: false,
      });

      const result = await service.resolveMyTruckForDate('pedro', '2026-02-11');

      expect(result).toBeNull();
    });
  });
});
