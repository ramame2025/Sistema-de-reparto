import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  type ChangePasswordInput,
  type CreateUserInput,
  validateChangePasswordInput,
  validateCreateUserInput,
} from '@distribuidor/shared';
import { Roles } from '../auth/roles.decorator';
import { UsersService } from './users.service';

type AuthRequest = Request & {
  user?: {
    username?: string;
  };
};

@Controller('users')
@Roles('admin')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async listUsers() {
    return this.usersService.listUsers();
  }

  @Post()
  async createUser(@Body() input: CreateUserInput) {
    const errors = validateCreateUserInput(input);
    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Invalid user payload', errors });
    }

    return this.usersService.createUser(input);
  }

  @Patch(':id/password')
  @HttpCode(204)
  async changePassword(@Param('id') id: string, @Body() input: ChangePasswordInput) {
    const errors = validateChangePasswordInput(input);
    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Invalid password payload', errors });
    }

    await this.usersService.changePassword(id, input.password);
  }

  @Delete(':id')
  @HttpCode(204)
  async deleteUser(@Param('id') id: string, @Req() req: AuthRequest) {
    await this.usersService.deleteUser(id, req.user?.username);
  }
}
