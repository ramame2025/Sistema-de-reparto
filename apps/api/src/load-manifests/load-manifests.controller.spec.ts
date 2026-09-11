import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { CreateLoadManifestInput } from '@distribuidor/shared';
import { LoadManifestsController } from './load-manifests.controller';
import { LoadManifestsService } from './load-manifests.service';
import { DriverTruckAssignmentsService } from '../driver-truck-assignments/driver-truck-assignments.service';
import { ROLES_KEY } from '../auth/roles.decorator';

type AuthRequest = Request & { user?: { username?: string; sub?: string } };

function buildCreateInput(overrides: Partial<CreateLoadManifestInput> = {}): CreateLoadManifestInput {
  return {
    driverName: 'someone-else',
    truckId: 'truck-1',
    items: [{ productCode: 'G10', quantity: 10 }],
    ...overrides,
  };
}

describe('LoadManifestsController', () => {
  let controller: LoadManifestsController;
  let service: {
    createManifest: jest.Mock;
    listManifests: jest.Mock;
    listManifestsByDriver: jest.Mock;
    getTruckStockForDay: jest.Mock;
  };
  let assignments: { resolveMyTruckForDate: jest.Mock };

  beforeEach(async () => {
    service = {
      createManifest: jest.fn(),
      listManifests: jest.fn(),
      listManifestsByDriver: jest.fn(),
      getTruckStockForDay: jest.fn(),
    };
    assignments = { resolveMyTruckForDate: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LoadManifestsController],
      providers: [
        { provide: LoadManifestsService, useValue: service },
        { provide: DriverTruckAssignmentsService, useValue: assignments },
      ],
    }).compile();

    controller = module.get<LoadManifestsController>(LoadManifestsController);
  });

  describe('createManifest (POST /load-manifests)', () => {
    it('is restricted to admin and chofer roles', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, LoadManifestsController.prototype.createManifest);
      expect(roles).toEqual(['admin', 'chofer']);
    });

    it('resolves driverName only from req.user.username, never from the body', async () => {
      service.createManifest.mockResolvedValue({});
      const req = { user: { username: 'juan.perez' } } as unknown as AuthRequest;

      await controller.createManifest(buildCreateInput({ driverName: 'someone-else' }), req);

      expect(service.createManifest).toHaveBeenCalledWith(
        expect.objectContaining({ driverName: 'someone-else' }),
        'juan.perez',
      );
    });

    it('rejects an invalid payload with BadRequestException and never calls the service', async () => {
      const req = { user: { username: 'juan.perez' } } as unknown as AuthRequest;

      await expect(controller.createManifest(buildCreateInput({ items: [] }), req)).rejects.toThrow(
        BadRequestException,
      );
      expect(service.createManifest).not.toHaveBeenCalled();
    });
  });

  describe('listMyManifests (GET /load-manifests/mine)', () => {
    it('is restricted to admin and chofer roles', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, LoadManifestsController.prototype.listMyManifests);
      expect(roles).toEqual(['admin', 'chofer']);
    });

    it('resolves the driver identity only from req.user.username, ignoring any query/body-supplied filter', async () => {
      service.listManifestsByDriver.mockResolvedValue([]);
      const req = {
        user: { username: 'juan.perez' },
        query: { driverName: 'someone.else' },
        body: { driverName: 'someone.else' },
      } as unknown as AuthRequest;

      await controller.listMyManifests(req);

      expect(service.listManifestsByDriver).toHaveBeenCalledTimes(1);
      expect(service.listManifestsByDriver).toHaveBeenCalledWith('juan.perez');
      expect(service.listManifestsByDriver).not.toHaveBeenCalledWith('someone.else');
    });

    it('throws UnauthorizedException and never calls the service when req.user is missing', async () => {
      const req = {} as AuthRequest;

      await expect(controller.listMyManifests(req)).rejects.toThrow(UnauthorizedException);
      expect(service.listManifestsByDriver).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException and never calls the service when username is missing', async () => {
      const req = { user: {} } as AuthRequest;

      await expect(controller.listMyManifests(req)).rejects.toThrow(UnauthorizedException);
      expect(service.listManifestsByDriver).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException and never calls the service when username is empty/whitespace', async () => {
      const req = { user: { username: '   ' } } as AuthRequest;

      await expect(controller.listMyManifests(req)).rejects.toThrow(UnauthorizedException);
      expect(service.listManifestsByDriver).not.toHaveBeenCalled();
    });

    it('trims the username before passing it to the service', async () => {
      service.listManifestsByDriver.mockResolvedValue([]);
      const req = { user: { username: '  juan.perez  ' } } as unknown as AuthRequest;

      await controller.listMyManifests(req);

      expect(service.listManifestsByDriver).toHaveBeenCalledWith('juan.perez');
    });
  });

  describe('listManifests (GET /load-manifests)', () => {
    it('is restricted to the admin role only', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, LoadManifestsController.prototype.listManifests);
      expect(roles).toEqual(['admin']);
    });

    it('delegates to the service and returns all manifests', async () => {
      service.listManifests.mockResolvedValue([{ id: 'manifest-1' }]);

      const result = await controller.listManifests();

      expect(service.listManifests).toHaveBeenCalledTimes(1);
      expect(result).toEqual([{ id: 'manifest-1' }]);
    });
  });
  describe('getMyStock (GET /load-manifests/my-stock)', () => {
    const req = { user: { sub: 'driver-1', username: 'juan.perez' } } as unknown as AuthRequest;

    beforeEach(() => {
      assignments.resolveMyTruckForDate.mockResolvedValue({ truckId: 'truck-1', code: 'C-01' });
      service.getTruckStockForDay.mockResolvedValue({
        truckId: 'truck-1',
        date: '2026-01-31',
        manifestAt: '2026-01-31T10:10:00.000Z',
        lines: [],
      });
    });

    it('is restricted to admin and chofer roles', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, LoadManifestsController.prototype.getMyStock);
      expect(roles).toEqual(['admin', 'chofer']);
    });

    it('resolves the truck from the token, never from a caller-supplied id', async () => {
      const result = await controller.getMyStock(req, '2026-01-31');

      expect(assignments.resolveMyTruckForDate).toHaveBeenCalledWith('driver-1', '2026-01-31');
      expect(service.getTruckStockForDay).toHaveBeenCalledWith('truck-1', '2026-01-31');
      expect(result.date).toBe('2026-01-31');
      expect(result.stock).toEqual(
        expect.objectContaining({ truckId: 'truck-1', manifestAt: '2026-01-31T10:10:00.000Z' }),
      );
    });

    it('returns stock null, and never touches the stock query, when no truck is assigned', async () => {
      assignments.resolveMyTruckForDate.mockResolvedValue(null);

      const result = await controller.getMyStock(req, '2026-01-31');

      expect(result).toEqual({ date: '2026-01-31', stock: null });
      expect(service.getTruckStockForDay).not.toHaveBeenCalled();
    });

    it('defaults to today in business time when no date is given', async () => {
      await controller.getMyStock(req);

      const [, usedDate] = assignments.resolveMyTruckForDate.mock.calls[0] as [string, string];
      expect(usedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(service.getTruckStockForDay).toHaveBeenCalledWith('truck-1', usedDate);
    });

    it('throws UnauthorizedException and resolves nothing when the token carries no subject', async () => {
      await expect(controller.getMyStock({ user: {} } as AuthRequest)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(assignments.resolveMyTruckForDate).not.toHaveBeenCalled();
      expect(service.getTruckStockForDay).not.toHaveBeenCalled();
    });
  });
});
