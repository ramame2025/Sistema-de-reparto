import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import {
  type CreateExpenseInput,
  validateCreateExpenseInput,
} from '@distribuidor/shared';
import { ExpensesService } from './expenses.service';
import { Roles } from '../auth/roles.decorator';

@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Roles('admin')
  @Get()
  async listExpenses() {
    return this.expensesService.listExpenses();
  }

  @Roles('admin', 'chofer')
  @Post()
  async createExpense(@Body() input: CreateExpenseInput) {
    const errors = validateCreateExpenseInput(input);

    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Invalid expense payload', errors });
    }

    return this.expensesService.createExpense(input);
  }
}
