import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { ROLES_KEY } from '../auth/roles.decorator';

type AuthRequest = Request & { user?: { username?: string } };

describe('SalesController', () => {
  let controller: SalesController;
  let service: { listSalesByDriver: jest.Mock };

  beforeEach(async () => {
    service = {
      listSalesByDriver: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SalesController],
      providers: [{ provide: SalesService, useValue: service }],
    }).compile();

    controller = module.get<SalesController>(SalesController);
  });

  describe('listMySales', () => {
    it('is restricted to admin and chofer roles', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, SalesController.prototype.listMySales);
      expect(roles).toEqual(['admin', 'chofer']);
    });

    it('resolves the driver identity only from req.user.username, ignoring any query/body-supplied filter', async () => {
      service.listSalesByDriver.mockResolvedValue([]);
      const req = {
        user: { username: 'juan.perez' },
        query: { driverName: 'someone.else' },
        body: { driverName: 'someone.else' },
      } as unknown as AuthRequest;

      await controller.listMySales(req);

      expect(service.listSalesByDriver).toHaveBeenCalledTimes(1);
      expect(service.listSalesByDriver).toHaveBeenCalledWith('juan.perez');
      expect(service.listSalesByDriver).not.toHaveBeenCalledWith('someone.else');
    });

    it('throws UnauthorizedException and never calls the service when req.user is missing', async () => {
      const req = {} as AuthRequest;

      await expect(controller.listMySales(req)).rejects.toThrow(UnauthorizedException);
      expect(service.listSalesByDriver).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException and never calls the service when username is missing', async () => {
      const req = { user: {} } as AuthRequest;

      await expect(controller.listMySales(req)).rejects.toThrow(UnauthorizedException);
      expect(service.listSalesByDriver).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException and never calls the service when username is empty/whitespace', async () => {
      const req = { user: { username: '   ' } } as AuthRequest;

      await expect(controller.listMySales(req)).rejects.toThrow(UnauthorizedException);
      expect(service.listSalesByDriver).not.toHaveBeenCalled();
    });

    it('trims the username before passing it to the service', async () => {
      service.listSalesByDriver.mockResolvedValue([]);
      const req = { user: { username: '  juan.perez  ' } } as AuthRequest;

      await controller.listMySales(req);

      expect(service.listSalesByDriver).toHaveBeenCalledWith('juan.perez');
    });
  });

  describe('listSales (regression — admin route untouched)', () => {
    it('remains restricted to the admin role only', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, SalesController.prototype.listSales);
      expect(roles).toEqual(['admin']);
    });
  });
});
