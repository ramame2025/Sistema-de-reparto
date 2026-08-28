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
  type CreateProductInput,
  type UpdateProductInput,
  validateCreateProductInput,
  validateUpdateProductInput,
} from '@distribuidor/shared';
import type { Request } from 'express';
import type { UserRole } from '@distribuidor/shared';
import { Roles } from '../auth/roles.decorator';
import { ProductsService } from './products.service';

type AuthRequest = Request & {
  user?: {
    role?: UserRole;
  };
};

@Controller('products')
@Roles('admin')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @Roles('admin', 'chofer')
  async listProducts(
    @Query('includeInactive') includeInactive: string | undefined,
    @Req() req: AuthRequest,
  ) {
    // Un producto dado de baja no se le ofrece al chofer bajo ninguna
    // circunstancia, aunque lo pida por query: `includeInactive` es una
    // herramienta del admin para mantener el catalogo.
    const isAdmin = req.user?.role === 'admin';

    return this.productsService.listProducts({
      includeInactive: isAdmin && includeInactive === 'true',
    });
  }

  @Post()
  async createProduct(@Body() input: CreateProductInput) {
    const errors = validateCreateProductInput(input);
    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Invalid product payload', errors });
    }

    return this.productsService.createProduct(input);
  }

  @Patch(':id')
  async updateProduct(@Param('id') id: string, @Body() input: UpdateProductInput) {
    const errors = validateUpdateProductInput(input);
    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Invalid product payload', errors });
    }

    return this.productsService.updateProduct(id, input);
  }
}
