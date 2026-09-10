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
  type CreateZoneInput,
  type UpdateZoneInput,
  validateCreateZoneInput,
  validateUpdateZoneInput,
} from '@distribuidor/shared';
import type { Request } from 'express';
import type { UserRole } from '@distribuidor/shared';
import { Roles } from '../auth/roles.decorator';
import { ZonesService } from './zones.service';

type AuthRequest = Request & {
  user?: {
    role?: UserRole;
  };
};

@Controller('zones')
@Roles('admin')
export class ZonesController {
  constructor(private readonly zonesService: ZonesService) {}

  @Get()
  @Roles('admin', 'chofer')
  async listZones(
    @Query('includeInactive') includeInactive: string | undefined,
    @Req() req: AuthRequest,
  ) {
    // Una zona dada de baja no se le ofrece al chofer bajo ninguna
    // circunstancia, aunque la pida por query: `includeInactive` es una
    // herramienta del admin para mantener el mapa de reparto.
    const isAdmin = req.user?.role === 'admin';

    return this.zonesService.listZones({
      includeInactive: isAdmin && includeInactive === 'true',
    });
  }

  @Post()
  async createZone(@Body() input: CreateZoneInput) {
    const errors = validateCreateZoneInput(input);
    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Invalid zone payload', errors });
    }

    return this.zonesService.createZone(input);
  }

  @Patch(':id')
  async updateZone(@Param('id') id: string, @Body() input: UpdateZoneInput) {
    const errors = validateUpdateZoneInput(input);
    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Invalid zone payload', errors });
    }

    return this.zonesService.updateZone(id, input);
  }
}
