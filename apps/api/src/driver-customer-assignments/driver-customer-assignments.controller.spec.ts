import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import type { CreateDriverCustomerAssignmentInput } from '@distribuidor/shared';
import { ROLES_KEY } from '../auth/roles.decorator';
import { DriverCustomerAssignmentsController } from './driver-customer-assignments.controller';
import { DriverCustomerAssignmentsService } from './driver-customer-assignments.service';

describe('DriverCustomerAssignmentsController', () => {
  let controller: DriverCustomerAssignmentsController;
  let service: {
    listAssignments: jest.Mock;
    getMyAssignment: jest.Mock;
    replaceAssignment: jest.Mock;
  };

  const validInput: CreateDriverCustomerAssignmentInput = {
    driverId: 'driver-1',
    date: '2026-08-21',
    customerIds: ['customer-1', 'customer-2'],
  };

  beforeEach(async () => {
    service = {
      listAssignments: jest.fn(),
      getMyAssignment: jest.fn(),
      replaceAssignment: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DriverCustomerAssignmentsController],
      providers: [
        { provide: DriverCustomerAssignmentsService, useValue: service },
      ],
    }).compile();

    controller = module.get<DriverCustomerAssignmentsController>(
      DriverCustomerAssignmentsController,
    );
  });

  it('is restricted to admin at class level', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, DriverCustomerAssignmentsController);
    expect(roles).toEqual(['admin']);
  });

  describe('listAssignments', () => {
    it('delegates to the service', async () => {
      service.listAssignments.mockResolvedValue([]);

      const result = await controller.listAssignments();

      expect(service.listAssignments).toHaveBeenCalledTimes(1);
      expect(result).toEqual([]);
    });
  });

  describe('getMyAssignment', () => {
    type AuthRequest = Request & { user?: { sub?: string; role?: string } };

    it('overrides the class-level admin-only restriction with admin+chofer', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        DriverCustomerAssignmentsController.prototype.getMyAssignment,
      );
      expect(roles).toEqual(['admin', 'chofer']);
    });

    it('resolves the driver only from req.user.sub, ignoring any query-supplied driverId', async () => {
      // Sin esto un chofer podria pedir la lista de otro con ?driverId=.
      service.getMyAssignment.mockResolvedValue([]);
      const req = {
        user: { sub: 'driver-1', role: 'chofer' },
        query: { driverId: 'driver-2' },
      } as unknown as AuthRequest;

      await controller.getMyAssignment(req, '2026-08-21');

      expect(service.getMyAssignment).toHaveBeenCalledTimes(1);
      expect(service.getMyAssignment).toHaveBeenCalledWith('driver-1', '2026-08-21');
      expect(service.getMyAssignment).not.toHaveBeenCalledWith(
        'driver-2',
        expect.anything(),
      );
    });

    it('returns 200 with an empty customers array when nothing is assigned, never a 404', async () => {
      service.getMyAssignment.mockResolvedValue([]);
      const req = { user: { sub: 'driver-1' } } as unknown as AuthRequest;

      const result = await controller.getMyAssignment(req, '2026-08-21');

      expect(result).toEqual({ date: '2026-08-21', customers: [] });
    });

    it('reports the resolved date back in the envelope', async () => {
      const customers = [{ id: 'customer-1', name: 'Kiosco Sur' }];
      service.getMyAssignment.mockResolvedValue(customers);
      const req = { user: { sub: 'driver-1' } } as unknown as AuthRequest;

      const result = await controller.getMyAssignment(req, '2026-08-21');

      expect(result).toEqual({ date: '2026-08-21', customers });
    });

    it('throws UnauthorizedException when the token carries no subject', async () => {
      const req = { user: {} } as unknown as AuthRequest;

      await expect(controller.getMyAssignment(req, '2026-08-21')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(service.getMyAssignment).not.toHaveBeenCalled();
    });

    it('defaults to today in the business time zone when no date is given', async () => {
      service.getMyAssignment.mockResolvedValue([]);
      const req = { user: { sub: 'driver-1' } } as unknown as AuthRequest;

      await controller.getMyAssignment(req, undefined);

      const [, date] = service.getMyAssignment.mock.calls[0];
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('replaceAssignment', () => {
    it('is admin-only (no per-route override, inherits the class-level [admin])', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        DriverCustomerAssignmentsController.prototype.replaceAssignment,
      );
      expect(roles).toBeUndefined();
    });

    it('validates the payload before calling the service, rejecting duplicate customerIds', async () => {
      await expect(
        controller.replaceAssignment({
          ...validInput,
          customerIds: ['customer-1', 'customer-1'],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(service.replaceAssignment).not.toHaveBeenCalled();
    });

    it('delegates a valid payload to the service', async () => {
      service.replaceAssignment.mockResolvedValue({ id: 'assignment-1' });

      const result = await controller.replaceAssignment(validInput);

      expect(service.replaceAssignment).toHaveBeenCalledWith(validInput);
      expect(result).toEqual({ id: 'assignment-1' });
    });
  });
});
