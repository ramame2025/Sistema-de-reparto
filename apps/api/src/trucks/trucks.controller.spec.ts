import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { ROLES_KEY } from '../auth/roles.decorator';
import { DriverTruckAssignmentsService } from '../driver-truck-assignments/driver-truck-assignments.service';
import { LoadManifestsService } from '../load-manifests/load-manifests.service';
import { TrucksController } from './trucks.controller';
import { TrucksService } from './trucks.service';

describe('TrucksController', () => {
  let controller: TrucksController;
  let trucksService: { getTruck: jest.Mock; updateTruck: jest.Mock; listTrucks: jest.Mock };
  let assignmentsService: { getTruckCalendar: jest.Mock };
  let loadManifestsService: { getTruckStock: jest.Mock };

  beforeEach(async () => {
    trucksService = { getTruck: jest.fn(), updateTruck: jest.fn(), listTrucks: jest.fn() };
    assignmentsService = { getTruckCalendar: jest.fn() };
    loadManifestsService = { getTruckStock: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TrucksController],
      providers: [
        { provide: TrucksService, useValue: trucksService },
        { provide: DriverTruckAssignmentsService, useValue: assignmentsService },
        { provide: LoadManifestsService, useValue: loadManifestsService },
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
  describe('updateTruck', () => {
    it('delegates a valid partial payload to the service', async () => {
      trucksService.updateTruck.mockResolvedValue({ id: 'truck-1', capacity: 45 });

      const result = await controller.updateTruck('truck-1', { capacity: 45 });

      expect(trucksService.updateTruck).toHaveBeenCalledWith('truck-1', { capacity: 45 });
      expect(result.capacity).toBe(45);
    });

    it('rejects an empty payload before touching the service', async () => {
      await expect(controller.updateTruck('truck-1', {})).rejects.toThrow(BadRequestException);
      expect(trucksService.updateTruck).not.toHaveBeenCalled();
    });

    it('rejects a negative capacity', async () => {
      await expect(controller.updateTruck('truck-1', { capacity: -5 })).rejects.toThrow(
        BadRequestException,
      );
      expect(trucksService.updateTruck).not.toHaveBeenCalled();
    });
  });

  describe('listTrucks', () => {
    it('passes includeInactive through only when the query says so', async () => {
      trucksService.listTrucks.mockResolvedValue([]);

      await controller.listTrucks('true');
      expect(trucksService.listTrucks).toHaveBeenLastCalledWith(true);

      await controller.listTrucks(undefined);
      expect(trucksService.listTrucks).toHaveBeenLastCalledWith(false);
    });
  });

  describe('getTruckStock', () => {
    it('404s for a truck that does not exist, before computing stock', async () => {
      // Mismo orden que :id/calendar: un camion inexistente es un 404, no un
      // stock en cero.
      trucksService.getTruck.mockRejectedValue(new NotFoundException('Truck not found'));

      await expect(controller.getTruckStock('ghost', undefined)).rejects.toThrow(
        NotFoundException,
      );
      expect(loadManifestsService.getTruckStock).not.toHaveBeenCalled();
    });

    it('checks the truck exists before delegating to loadManifestsService', async () => {
      trucksService.getTruck.mockResolvedValue({ id: 'truck-1', code: 'T-01' });
      loadManifestsService.getTruckStock.mockResolvedValue({
        truckId: 'truck-1',
        asOf: '2026-01-15',
        lines: [],
      });

      await controller.getTruckStock('truck-1', '2026-01-15');

      expect(trucksService.getTruck).toHaveBeenCalledWith('truck-1');
    });

    it('defaults asOf to today in business timezone when not provided in the query', async () => {
      trucksService.getTruck.mockResolvedValue({ id: 'truck-1', code: 'T-01' });
      loadManifestsService.getTruckStock.mockResolvedValue({
        truckId: 'truck-1',
        asOf: 'irrelevant',
        lines: [],
      });

      await controller.getTruckStock('truck-1', undefined);

      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
      }).format(new Date());

      expect(loadManifestsService.getTruckStock).toHaveBeenCalledWith('truck-1', today);
    });

    it('passes an explicit asOf through unchanged', async () => {
      trucksService.getTruck.mockResolvedValue({ id: 'truck-1', code: 'T-01' });
      loadManifestsService.getTruckStock.mockResolvedValue({
        truckId: 'truck-1',
        asOf: '2026-01-15',
        lines: [],
      });

      await controller.getTruckStock('truck-1', '2026-01-15');

      expect(loadManifestsService.getTruckStock).toHaveBeenCalledWith('truck-1', '2026-01-15');
    });

    it('returns the stock summary produced by the service', async () => {
      trucksService.getTruck.mockResolvedValue({ id: 'truck-1', code: 'T-01' });
      const summary = { truckId: 'truck-1', asOf: '2026-01-15', lines: [] };
      loadManifestsService.getTruckStock.mockResolvedValue(summary);

      const result = await controller.getTruckStock('truck-1', '2026-01-15');

      expect(result).toEqual(summary);
    });
  });
});
