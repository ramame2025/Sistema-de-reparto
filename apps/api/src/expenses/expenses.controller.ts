import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  type CreateExpenseInput,
  validateCreateExpenseInput,
} from '@distribuidor/shared';
import { ExpensesService } from './expenses.service';
import { Roles } from '../auth/roles.decorator';
import type { Request } from 'express';

type AuthRequest = Request & {
  user?: {
    username?: string;
  };
};

@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Roles('admin')
  @Get()
  async listExpenses() {
    return this.expensesService.listExpenses();
  }

  @Roles('admin', 'chofer')
  @Get('mine')
  async listMyExpenses(@Req() req: AuthRequest) {
    const username = req.user?.username?.trim();

    if (!username) {
      throw new UnauthorizedException();
    }

    return this.expensesService.listExpensesByDriver(username);
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
