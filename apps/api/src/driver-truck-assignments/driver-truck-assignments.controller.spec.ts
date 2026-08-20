import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import type { CreateAssignmentInput } from '@distribuidor/shared';
import { ROLES_KEY } from '../auth/roles.decorator';
import { DriverTruckAssignmentsController } from './driver-truck-assignments.controller';
import { DriverTruckAssignmentsService } from './driver-truck-assignments.service';

describe('DriverTruckAssignmentsController', () => {
  let controller: DriverTruckAssignmentsController;
  let service: {
    previewAssignment: jest.Mock;
    createAssignment: jest.Mock;
    resolveMyTruckForDate: jest.Mock;
  };

  const cobertura: CreateAssignmentInput = {
    driverId: 'pedro',
    truckId: 'truck-1',
    kind: 'cobertura',
    startDate: '2026-02-10T00:00:00.000Z',
    endDate: '2026-02-12T00:00:00.000Z',
  };

  beforeEach(async () => {
    service = {
      previewAssignment: jest.fn(),
      createAssignment: jest.fn(),
      resolveMyTruckForDate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DriverTruckAssignmentsController],
      providers: [{ provide: DriverTruckAssignmentsService, useValue: service }],
    }).compile();

    controller = module.get<DriverTruckAssignmentsController>(
      DriverTruckAssignmentsController,
    );
  });

  it('is restricted to admin', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, DriverTruckAssignmentsController);
    expect(roles).toEqual(['admin']);
  });

  describe('previewAssignment', () => {
    it('returns the warnings without creating anything', async () => {
      service.previewAssignment.mockResolvedValue([
        { code: 'driver_leaves_own_truck', truckId: 'truck-2' },
      ]);

      const result = await controller.previewAssignment(cobertura);

      expect(service.previewAssignment).toHaveBeenCalledWith(cobertura);
      expect(service.createAssignment).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });

    it('applies the same validation as create, so preview cannot green-light an invalid payload', async () => {
      await expect(
        controller.previewAssignment({ ...cobertura, endDate: undefined }),
      ).rejects.toThrow(BadRequestException);
      expect(service.previewAssignment).not.toHaveBeenCalled();
    });
  });
  describe('getMyTruck', () => {
    type AuthRequest = Request & { user?: { sub?: string; role?: string } };

    it('is open to chofer as well as admin, overriding the admin-only class decorator', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        DriverTruckAssignmentsController.prototype.getMyTruck,
      );
      expect(roles).toEqual(['admin', 'chofer']);
    });

    it('resolves the driver only from req.user.sub, ignoring any query-supplied driverId', async () => {
      // Sin esto, un chofer podria pedir el camion de otro con ?driverId=.
      service.resolveMyTruckForDate.mockResolvedValue(null);
      const req = {
        user: { sub: 'pedro', role: 'chofer' },
        query: { driverId: 'juan' },
      } as unknown as AuthRequest;

      await controller.getMyTruck(req, '2026-02-11');

      expect(service.resolveMyTruckForDate).toHaveBeenCalledTimes(1);
      expect(service.resolveMyTruckForDate).toHaveBeenCalledWith('pedro', '2026-02-11');
      expect(service.resolveMyTruckForDate).not.toHaveBeenCalledWith(
        'juan',
        expect.anything(),
      );
    });

    it('answers with an explicit envelope so "no truck" is distinguishable from a broken response', async () => {
      // Devolver `null` pelado hace que Nest mande Content-Length: 0, y el
      // cliente no puede diferenciar "hoy no manejas" de una respuesta rota.
      service.resolveMyTruckForDate.mockResolvedValue(null);
      const req = { user: { sub: 'juan' } } as unknown as AuthRequest;

      const result = await controller.getMyTruck(req, '2026-01-15');

      expect(result).toEqual({ date: '2026-01-15', truck: null });
    });

    it('reports the resolved date back, so the client knows which day it answered for', async () => {
      const truck = { truckId: 'truck-1', code: 'T-01', capacity: 40, kind: 'titular' };
      service.resolveMyTruckForDate.mockResolvedValue(truck);
      const req = { user: { sub: 'pedro' } } as unknown as AuthRequest;

      const result = await controller.getMyTruck(req, '2026-02-11');

      expect(result).toEqual({ date: '2026-02-11', truck });
    });

    it('throws UnauthorizedException when the token carries no subject', async () => {
      const req = { user: {} } as unknown as AuthRequest;

      await expect(controller.getMyTruck(req, '2026-02-11')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(service.resolveMyTruckForDate).not.toHaveBeenCalled();
    });

    it('defaults to today in the business time zone when no date is given', async () => {
      service.resolveMyTruckForDate.mockResolvedValue(null);
      const req = { user: { sub: 'pedro' } } as unknown as AuthRequest;

      await controller.getMyTruck(req, undefined);

      const [, date] = service.resolveMyTruckForDate.mock.calls[0];
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
