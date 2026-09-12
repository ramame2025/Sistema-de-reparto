import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  type CreateLoadManifestInput,
  type MyTruckStockResponse,
  validateCreateLoadManifestInput,
} from '@distribuidor/shared';
import { LoadManifestsService } from './load-manifests.service';
import { DriverTruckAssignmentsService } from '../driver-truck-assignments/driver-truck-assignments.service';
import { Roles } from '../auth/roles.decorator';
import type { Request } from 'express';

type AuthRequest = Request & {
  user?: {
    username?: string;
    sub?: string;
  };
};

/**
 * Mismo motivo que en `driver-truck-assignments.controller.ts` y en
 * `trucks.controller.ts`: en UTC, un chofer que abre la app a las 21:00 veria
 * el remito del dia siguiente.
 */
const BUSINESS_TIME_ZONE = 'America/Argentina/Buenos_Aires';

const todayInBusinessZone = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE }).format(new Date());

@Controller('load-manifests')
export class LoadManifestsController {
  constructor(
    private readonly loadManifestsService: LoadManifestsService,
    private readonly assignmentsService: DriverTruckAssignmentsService,
  ) {}

  /**
   * Que le queda HOY en el camion. El camion sale SIEMPRE de la asignacion del
   * token -- un chofer no puede pedir el stock de otro, que es justamente por
   * lo que no se abre el `GET /trucks/:id/stock` de admin.
   */
  @Roles('admin', 'chofer')
  @Get('my-stock')
  async getMyStock(
    @Req() req: AuthRequest,
    @Query('date') date?: string,
  ): Promise<MyTruckStockResponse> {
    const driverId = req.user?.sub?.trim();

    if (!driverId) {
      throw new UnauthorizedException();
    }

    const resolvedDate = date || todayInBusinessZone();
    const truck = await this.assignmentsService.resolveMyTruckForDate(driverId, resolvedDate);

    // Sin camion no hay stock que calcular, y `stock: null` lo dice sin
    // inventar un cero que se leeria como "cargaste y vendiste todo".
    if (!truck) {
      return { date: resolvedDate, stock: null };
    }

    return {
      date: resolvedDate,
      stock: await this.loadManifestsService.getTruckStockForDay(truck.truckId, resolvedDate),
    };
  }

  @Roles('admin')
  @Get()
  async listManifests() {
    return this.loadManifestsService.listManifests();
  }

  @Roles('admin', 'chofer')
  @Get('mine')
  async listMyManifests(@Req() req: AuthRequest) {
    const username = req.user?.username?.trim();

    if (!username) {
      throw new UnauthorizedException();
    }

    return this.loadManifestsService.listManifestsByDriver(username);
  }

  @Roles('admin', 'chofer')
  @Post()
  async createManifest(@Body() input: CreateLoadManifestInput, @Req() req: AuthRequest) {
    const errors = validateCreateLoadManifestInput(input);

    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Invalid load manifest payload', errors });
    }

    return this.loadManifestsService.createManifest(input, req.user?.username);
  }
}
