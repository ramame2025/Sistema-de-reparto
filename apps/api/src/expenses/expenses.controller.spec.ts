import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { ROLES_KEY } from '../auth/roles.decorator';

type AuthRequest = Request & { user?: { username?: string } };

describe('ExpensesController', () => {
  let controller: ExpensesController;
  let service: { listExpenses: jest.Mock; listExpensesByDriver: jest.Mock; createExpense: jest.Mock };

  beforeEach(async () => {
    service = {
      listExpenses: jest.fn(),
      listExpensesByDriver: jest.fn(),
      createExpense: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExpensesController],
      providers: [{ provide: ExpensesService, useValue: service }],
    }).compile();

    controller = module.get<ExpensesController>(ExpensesController);
  });

  describe('listMyExpenses', () => {
    it('is restricted to admin and chofer roles', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, ExpensesController.prototype.listMyExpenses);
      expect(roles).toEqual(['admin', 'chofer']);
    });

    it('resolves the driver identity only from req.user.username, ignoring any query/body-supplied filter', async () => {
      service.listExpensesByDriver.mockResolvedValue([]);
      const req = {
        user: { username: 'juan.perez' },
        query: { driverName: 'someone.else' },
        body: { driverName: 'someone.else' },
      } as unknown as AuthRequest;

      await controller.listMyExpenses(req);

      expect(service.listExpensesByDriver).toHaveBeenCalledTimes(1);
      expect(service.listExpensesByDriver).toHaveBeenCalledWith('juan.perez');
      expect(service.listExpensesByDriver).not.toHaveBeenCalledWith('someone.else');
    });

    it('throws UnauthorizedException and never calls the service when req.user is missing', async () => {
      const req = {} as AuthRequest;

      await expect(controller.listMyExpenses(req)).rejects.toThrow(UnauthorizedException);
      expect(service.listExpensesByDriver).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException and never calls the service when username is missing', async () => {
      const req = { user: {} } as AuthRequest;

      await expect(controller.listMyExpenses(req)).rejects.toThrow(UnauthorizedException);
      expect(service.listExpensesByDriver).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException and never calls the service when username is empty/whitespace', async () => {
      const req = { user: { username: '   ' } } as AuthRequest;

      await expect(controller.listMyExpenses(req)).rejects.toThrow(UnauthorizedException);
      expect(service.listExpensesByDriver).not.toHaveBeenCalled();
    });

    it('trims the username before passing it to the service', async () => {
      service.listExpensesByDriver.mockResolvedValue([]);
      const req = { user: { username: '  juan.perez  ' } } as AuthRequest;

      await controller.listMyExpenses(req);

      expect(service.listExpensesByDriver).toHaveBeenCalledWith('juan.perez');
    });
  });

  describe('listExpenses (regression — admin route untouched)', () => {
    it('remains restricted to the admin role only', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, ExpensesController.prototype.listExpenses);
      expect(roles).toEqual(['admin']);
    });

    it('delegates straight to the service', async () => {
      service.listExpenses.mockResolvedValue([]);

      await controller.listExpenses();

      expect(service.listExpenses).toHaveBeenCalledTimes(1);
    });
  });
});
