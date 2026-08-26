import { Test } from '@nestjs/testing';
import type { ExpenseRecord } from '@distribuidor/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ExpensesService } from './expenses.service';

describe('ExpensesService', () => {
  let service: ExpensesService;
  let prisma: {
    driverExpense: { findMany: jest.Mock; create: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      driverExpense: { findMany: jest.fn(), create: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [ExpensesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(ExpensesService);
  });

  describe('listExpensesByDriver', () => {
    it('queries expenses scoped to a where clause containing only the given driverName', async () => {
      prisma.driverExpense.findMany.mockResolvedValue([]);

      await service.listExpensesByDriver('juan.perez');

      expect(prisma.driverExpense.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.driverExpense.findMany).toHaveBeenCalledWith({
        where: { driverName: 'juan.perez' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('does not merge any additional caller-supplied filter into the where clause', async () => {
      prisma.driverExpense.findMany.mockResolvedValue([]);

      await service.listExpensesByDriver('juan.perez');

      const callArgs = prisma.driverExpense.findMany.mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(Object.keys(callArgs.where)).toEqual(['driverName']);
    });

    it('scopes strictly to the requested driver, excluding another driver even if present in storage', async () => {
      prisma.driverExpense.findMany.mockResolvedValue([]);

      await service.listExpensesByDriver('maria.gomez');

      expect(prisma.driverExpense.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { driverName: 'maria.gomez' } }),
      );
    });

    it('orders results newest-first via createdAt desc', async () => {
      prisma.driverExpense.findMany.mockResolvedValue([]);

      await service.listExpensesByDriver('juan.perez');

      expect(prisma.driverExpense.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
      );
    });

    it('maps prisma expense rows to the same ExpenseRecord shape as listExpenses', async () => {
      const now = new Date('2026-01-01T00:00:00.000Z');
      prisma.driverExpense.findMany.mockResolvedValue([
        {
          id: 'expense-1',
          createdAt: now,
          driverName: 'juan.perez',
          category: 'combustible',
          amount: 12000,
          note: null,
          receiptRef: 'https://cdn.test/receipt-1.jpg',
        },
      ]);

      const result: ExpenseRecord[] = await service.listExpensesByDriver('juan.perez');

      expect(result).toEqual([
        {
          id: 'expense-1',
          createdAt: now.toISOString(),
          driverName: 'juan.perez',
          category: 'combustible',
          amount: 12000,
          note: undefined,
          receiptRef: 'https://cdn.test/receipt-1.jpg',
        },
      ]);
    });
  });
});
