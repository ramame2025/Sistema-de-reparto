import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  type CreateCustomerCategoryInput,
  type UpdateCustomerCategoryInput,
  validateCreateCustomerCategoryInput,
  validateUpdateCustomerCategoryInput,
} from '@distribuidor/shared';
import type { Request } from 'express';
import type { UserRole } from '@distribuidor/shared';
import { Roles } from '../auth/roles.decorator';
import { CustomerCategoriesService } from './customer-categories.service';

type AuthRequest = Request & {
  user?: {
    role?: UserRole;
  };
};

@Controller('customer-categories')
@Roles('admin')
export class CustomerCategoriesController {
  constructor(private readonly categoriesService: CustomerCategoriesService) {}

  @Get()
  @Roles('admin', 'chofer')
  async listCategories(
    @Query('includeInactive') includeInactive: string | undefined,
    @Req() req: AuthRequest,
  ) {
    // Una categoria dada de baja no se le ofrece al chofer bajo ninguna
    // circunstancia, aunque la pida por query: `includeInactive` es una
    // herramienta del admin para mantener el catalogo. Que no se OFREZCA no
    // significa que no se ACEPTE: una venta encolada que la traiga se graba
    // igual (ver `assertCategoryCodesExist`).
    const isAdmin = req.user?.role === 'admin';

    return this.categoriesService.listCategories({
      includeInactive: isAdmin && includeInactive === 'true',
    });
  }

  @Post()
  async createCategory(@Body() input: CreateCustomerCategoryInput) {
    const errors = validateCreateCustomerCategoryInput(input);
    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'Invalid customer category payload',
        errors,
      });
    }

    return this.categoriesService.createCategory(input);
  }

  @Patch(':id')
  async updateCategory(
    @Param('id') id: string,
    @Body() input: UpdateCustomerCategoryInput,
  ) {
    const errors = validateUpdateCustomerCategoryInput(input);
    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'Invalid customer category payload',
        errors,
      });
    }

    return this.categoriesService.updateCategory(id, input);
  }
}
