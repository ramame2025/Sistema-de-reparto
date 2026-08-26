import { Injectable } from '@nestjs/common';
import { type DriverExpense } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { type CreateExpenseInput, type ExpenseRecord } from '@distribuidor/shared';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async listExpenses(): Promise<ExpenseRecord[]> {
    const expenses = await this.prisma.driverExpense.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return expenses.map((expense) => this.toRecord(expense));
  }

  async listExpensesByDriver(driverName: string): Promise<ExpenseRecord[]> {
    const expenses = await this.prisma.driverExpense.findMany({
      where: { driverName },
      orderBy: { createdAt: 'desc' },
    });

    return expenses.map((expense) => this.toRecord(expense));
  }

  async createExpense(input: CreateExpenseInput): Promise<ExpenseRecord> {
    const expense = await this.prisma.driverExpense.create({
      data: {
        driverName: input.driverName.trim(),
        category: input.category,
        amount: Math.round(input.amount),
        note: input.note?.trim() || null,
        receiptRef: input.receiptRef?.trim() || null,
      },
    });

    return this.toRecord(expense);
  }

  private toRecord(expense: DriverExpense): ExpenseRecord {
    return {
      id: expense.id,
      createdAt: expense.createdAt.toISOString(),
      driverName: expense.driverName,
      category: expense.category,
      amount: expense.amount,
      note: expense.note ?? undefined,
      receiptRef: expense.receiptRef ?? undefined,
    };
  }
}
