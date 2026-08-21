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
  Query,
} from '@nestjs/common';
import {
  type CreateTruckInput,
  type TruckStockSummary,
  type UpdateTruckInput,
  validateCreateTruckInput,
  validateUpdateTruckInput,
} from '@distribuidor/shared';
import { Roles } from '../auth/roles.decorator';
import {
  DriverTruckAssignmentsService,
  type TruckCalendar,
} from '../driver-truck-assignments/driver-truck-assignments.service';
import { LoadManifestsService } from '../load-manifests/load-manifests.service';
import { TrucksService } from './trucks.service';

/**
 * El reparto opera en Argentina: si el "hoy" por defecto se tomara en UTC, un
 * chofer que abre la app a la noche veria el stock de otro dia. Mismo helper
 * que `driver-truck-assignments.controller.ts` (no hay un util compartido
 * hoy, asi que se repite igual que en `users.service.ts`).
 */
const BUSINESS_TIME_ZONE = 'America/Argentina/Buenos_Aires';

const todayInBusinessZone = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE }).format(new Date());

@Controller('trucks')
@Roles('admin')
export class TrucksController {
  constructor(
    private readonly trucksService: TrucksService,
    private readonly assignmentsService: DriverTruckAssignmentsService,
    private readonly loadManifestsService: LoadManifestsService,
  ) {}

  @Get()
  async listTrucks(@Query('includeInactive') includeInactive?: string) {
    return this.trucksService.listTrucks(includeInactive === 'true');
  }

  /**
   * Calendario mensual del camion. Devuelve las filas crudas (para editar un
   * bloque) y la proyeccion dia a dia (para pintar quien maneja cada dia).
   */
  @Get(':id/calendar')
  async getTruckCalendar(
    @Param('id') id: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ): Promise<TruckCalendar> {
    if (!from || !to) {
      throw new BadRequestException({
        message: 'Invalid query',
        errors: ['from and to query parameters are required'],
      });
    }

    // Un camion inexistente es un 404, no un mes en blanco.
    await this.trucksService.getTruck(id);

    return this.assignmentsService.getTruckCalendar(id, from, to);
  }

  /**
   * Stock derivado del camion (cargado - vendido). Mismo orden que
   * `:id/calendar`: primero se confirma que el camion existe (404), recien
   * despues se calcula.
   */
  @Get(':id/stock')
  async getTruckStock(
    @Param('id') id: string,
    @Query('asOf') asOf?: string,
  ): Promise<TruckStockSummary> {
    await this.trucksService.getTruck(id);

    return this.loadManifestsService.getTruckStock(id, asOf || todayInBusinessZone());
  }

  @Post()
  async createTruck(@Body() input: CreateTruckInput) {
    const errors = validateCreateTruckInput(input);
    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Invalid truck payload', errors });
    }

    return this.trucksService.createTruck(input);
  }

  @Patch(':id')
  async updateTruck(@Param('id') id: string, @Body() input: UpdateTruckInput) {
    const errors = validateUpdateTruckInput(input);
    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Invalid truck payload', errors });
    }

    return this.trucksService.updateTruck(id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  async deactivateTruck(@Param('id') id: string) {
    await this.trucksService.deactivateTruck(id);
  }
}
