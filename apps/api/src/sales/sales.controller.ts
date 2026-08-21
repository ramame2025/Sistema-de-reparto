import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  type CancelSaleInput,
  type CreateSaleInput,
  type RecordEmptyVisitInput,
  type UpdateSaleInput,
  validateCancelSaleInput,
  validateCreateSaleInput,
  validateRecordEmptyVisitInput,
  validateUpdateSaleInput,
} from '@distribuidor/shared';
import { SalesService } from './sales.service';
import { Roles } from '../auth/roles.decorator';
import type { Request } from 'express';

type AuthRequest = Request & {
  user?: {
    username?: string;
  };
};

@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Roles('admin')
  @Get()
  async listSales() {
    return this.salesService.listSales();
  }

  @Roles('admin', 'chofer')
  @Get('mine')
  async listMySales(@Req() req: AuthRequest) {
    const username = req.user?.username?.trim();

    if (!username) {
      throw new UnauthorizedException();
    }

    return this.salesService.listSalesByDriver(username);
  }

  @Roles('admin', 'chofer')
  @Post()
  async createSale(@Body() input: CreateSaleInput, @Req() req: AuthRequest) {
    const errors = validateCreateSaleInput(input);

    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Invalid sale payload', errors });
    }

    return this.salesService.createSale(input, req.user?.username);
  }

  @Roles('admin', 'chofer')
  @Post('empty-visit')
  async recordEmptyVisit(@Body() input: RecordEmptyVisitInput, @Req() req: AuthRequest) {
    const errors = validateRecordEmptyVisitInput(input);

    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Invalid empty-visit payload', errors });
    }

    return this.salesService.recordEmptyVisit(input, req.user?.username);
  }

  @Roles('admin', 'chofer')
  @Patch(':id')
  async updateSale(@Param('id') id: string, @Body() input: UpdateSaleInput, @Req() req: AuthRequest) {
    const errors = validateUpdateSaleInput(input);

    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Invalid update payload', errors });
    }

    return this.salesService.updateSale(id, input, req.user?.username);
  }

  @Roles('admin')
  @Patch(':id/cancel')
  async cancelSale(@Param('id') id: string, @Body() input: CancelSaleInput) {
    const errors = validateCancelSaleInput(input);

    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Invalid cancel payload', errors });
    }

    return this.salesService.cancelSale(id, input);
  }

  @Roles('admin')
  @Get(':id/audits')
  async listSaleAudits(@Param('id') id: string) {
    return this.salesService.listSaleAudits(id);
  }
}
