import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { ROLES_KEY } from '../auth/roles.decorator';
import { DriverTruckAssignmentsService } from '../driver-truck-assignments/driver-truck-assignments.service';
import { TrucksController } from './trucks.controller';
import { TrucksService } from './trucks.service';

describe('TrucksController', () => {
  let controller: TrucksController;
  let trucksService: { getTruck: jest.Mock };
  let assignmentsService: { getTruckCalendar: jest.Mock };

  beforeEach(async () => {
    trucksService = { getTruck: jest.fn() };
    assignmentsService = { getTruckCalendar: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TrucksController],
      providers: [
        { provide: TrucksService, useValue: trucksService },
        { provide: DriverTruckAssignmentsService, useValue: assignmentsService },
      ],
    }).compile();

    controller = module.get<TrucksController>(TrucksController);
  });

  describe('getTruckCalendar', () => {
    it('is restricted to admin', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, TrucksController);
      expect(roles).toEqual(['admin']);
    });

    it('returns the calendar for the requested window', async () => {
      trucksService.getTruck.mockResolvedValue({ id: 'truck-1', code: 'T-01' });
      assignmentsService.getTruckCalendar.mockResolvedValue({
        truckId: 'truck-1',
        from: '2026-02-01',
        to: '2026-02-28',
        assignments: [],
        days: [],
      });

      const result = await controller.getTruckCalendar('truck-1', '2026-02-01', '2026-02-28');

      expect(assignmentsService.getTruckCalendar).toHaveBeenCalledWith(
        'truck-1',
        '2026-02-01',
        '2026-02-28',
      );
      expect(result.truckId).toBe('truck-1');
    });

    it('rejects when from or to is missing', async () => {
      await expect(controller.getTruckCalendar('truck-1', '', '2026-02-28')).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.getTruckCalendar('truck-1', '2026-02-01', '')).rejects.toThrow(
        BadRequestException,
      );
      expect(assignmentsService.getTruckCalendar).not.toHaveBeenCalled();
    });

    it('404s for a truck that does not exist instead of returning an empty calendar', async () => {
      // Un calendario vacio y un camion inexistente son cosas distintas: si
      // devolvemos vacio, la UI dibuja un mes en blanco para un id fantasma.
      trucksService.getTruck.mockRejectedValue(new NotFoundException('Truck not found'));

      await expect(
        controller.getTruckCalendar('ghost', '2026-02-01', '2026-02-28'),
      ).rejects.toThrow(NotFoundException);
      expect(assignmentsService.getTruckCalendar).not.toHaveBeenCalled();
    });
  });
});
