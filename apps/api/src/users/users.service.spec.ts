import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { DriverTruckAssignmentsService } from '../driver-truck-assignments/driver-truck-assignments.service';
import { UsersService } from './users.service';

const userRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'u-1',
  username: 'juan',
  role: 'chofer',
  passwordHash: 'x',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

describe('UsersService/listUsers', () => {
  let service: UsersService;
  let prisma: { userAccount: { findMany: jest.Mock }; truck: { findMany: jest.Mock } };
  let assignments: { resolveAssignmentsForDriversOnDate: jest.Mock };

  beforeEach(async () => {
    prisma = {
      userAccount: { findMany: jest.fn() },
      truck: { findMany: jest.fn().mockResolvedValue([]) },
    };
    assignments = { resolveAssignmentsForDriversOnDate: jest.fn().mockResolvedValue(new Map()) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: DriverTruckAssignmentsService, useValue: assignments },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  it('only resolves trucks for choferes: an admin does not drive', async () => {
    prisma.userAccount.findMany.mockResolvedValue([
      userRow({ id: 'a-1', username: 'jefe', role: 'admin' }),
      userRow({ id: 'c-1', username: 'juan', role: 'chofer' }),
    ]);

    const result = await service.listUsers();

    expect(assignments.resolveAssignmentsForDriversOnDate).toHaveBeenCalledWith(
      ['c-1'],
      expect.any(String),
    );
    expect(result.find((u) => u.username === 'jefe')?.currentTruck).toBeUndefined();
  });

  it('attaches the truck code and kind to the driver who has one today', async () => {
    prisma.userAccount.findMany.mockResolvedValue([userRow({ id: 'c-1' })]);
    assignments.resolveAssignmentsForDriversOnDate.mockResolvedValue(
      new Map([['c-1', { truckId: 't-1', kind: 'cobertura' }]]),
    );
    prisma.truck.findMany.mockResolvedValue([{ id: 't-1', code: 'CAMION-07' }]);

    const [driver] = await service.listUsers();

    expect(driver.currentTruck).toEqual({
      truckId: 't-1',
      code: 'CAMION-07',
      kind: 'cobertura',
    });
  });

  it('reports null (not undefined) for a chofer with no truck today', async () => {
    // null = "hoy no maneja"; undefined = "no aplica, es admin". La pantalla
    // muestra cosas distintas para cada uno.
    prisma.userAccount.findMany.mockResolvedValue([userRow({ id: 'c-1' })]);

    const [driver] = await service.listUsers();

    expect(driver.currentTruck).toBeNull();
  });

  it('does not query trucks when no driver has an assignment', async () => {
    prisma.userAccount.findMany.mockResolvedValue([userRow({ id: 'c-1' })]);

    await service.listUsers();

    expect(prisma.truck.findMany).not.toHaveBeenCalled();
  });
});
