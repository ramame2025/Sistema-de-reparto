import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  type CreateTruckInput,
  validateCreateTruckInput,
} from '@distribuidor/shared';
import { Roles } from '../auth/roles.decorator';
import {
  DriverTruckAssignmentsService,
  type TruckCalendar,
} from '../driver-truck-assignments/driver-truck-assignments.service';
import { TrucksService } from './trucks.service';

@Controller('trucks')
@Roles('admin')
export class TrucksController {
  constructor(
    private readonly trucksService: TrucksService,
    private readonly assignmentsService: DriverTruckAssignmentsService,
  ) {}

  @Get()
  async listTrucks() {
    return this.trucksService.listTrucks();
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

  @Post()
  async createTruck(@Body() input: CreateTruckInput) {
    const errors = validateCreateTruckInput(input);
    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Invalid truck payload', errors });
    }

    return this.trucksService.createTruck(input);
  }

  @Delete(':id')
  @HttpCode(204)
  async deactivateTruck(@Param('id') id: string) {
    await this.trucksService.deactivateTruck(id);
  }
}
