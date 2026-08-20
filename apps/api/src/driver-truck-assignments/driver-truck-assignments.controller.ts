import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  type CreateAssignmentInput,
  validateCreateAssignmentInput,
} from '@distribuidor/shared';
import { Roles } from '../auth/roles.decorator';
import type { Request } from 'express';
import {
  type AssignmentWarning,
  type DriverTruckToday,
  DriverTruckAssignmentsService,
} from './driver-truck-assignments.service';

type AuthRequest = Request & {
  user?: {
    sub?: string;
  };
};

/**
 * El reparto opera en Argentina: si el dia por defecto se tomara en UTC, un
 * chofer que abre la app a las 21:00 veria el camion del dia siguiente.
 */
const BUSINESS_TIME_ZONE = 'America/Argentina/Buenos_Aires';

const todayInBusinessZone = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE }).format(new Date());

/**
 * Sobre vacio: devolver `null` pelado hace que Nest responda con cuerpo vacio,
 * y el cliente no puede distinguir "hoy no manejas" de una respuesta rota. El
 * `date` ademas le dice para que dia se resolvio cuando no lo mandó él.
 */
type MyTruckResponse = {
  date: string;
  truck: DriverTruckToday | null;
};

@Controller('driver-truck-assignments')
@Roles('admin')
export class DriverTruckAssignmentsController {
  constructor(
    private readonly assignmentsService: DriverTruckAssignmentsService,
  ) {}

  @Get()
  async listAssignments() {
    return this.assignmentsService.listAssignments();
  }

  /**
   * Que camion manejo hoy. La identidad sale SIEMPRE del token: un chofer no
   * puede pedir el camion de otro.
   */
  @Roles('admin', 'chofer')
  @Get('me')
  async getMyTruck(
    @Req() req: AuthRequest,
    @Query('date') date?: string,
  ): Promise<MyTruckResponse> {
    const driverId = req.user?.sub?.trim();

    if (!driverId) {
      throw new UnauthorizedException();
    }

    const resolvedDate = date || todayInBusinessZone();

    return {
      date: resolvedDate,
      truck: await this.assignmentsService.resolveMyTruckForDate(driverId, resolvedDate),
    };
  }

  @Get('truck/:truckId')
  async findAssignmentForTruckOnDate(
    @Param('truckId') truckId: string,
    @Query('date') date: string,
  ) {
    if (!date) {
      throw new BadRequestException({
        message: 'Invalid query',
        errors: ['date query parameter is required'],
      });
    }

    return this.assignmentsService.findAssignmentForTruckOnDate(truckId, date);
  }

  /**
   * Ensayo sin efectos: devuelve los avisos que el calendario del camion no
   * puede mostrar solo (por ejemplo, que el chofer deja su camion titular sin
   * nadie). La UI lo llama antes de confirmar.
   */
  @Post('preview')
  @HttpCode(200)
  async previewAssignment(
    @Body() input: CreateAssignmentInput,
  ): Promise<AssignmentWarning[]> {
    const errors = validateCreateAssignmentInput(input);
    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Invalid assignment payload', errors });
    }

    return this.assignmentsService.previewAssignment(input);
  }

  @Post()
  async createAssignment(@Body() input: CreateAssignmentInput) {
    const errors = validateCreateAssignmentInput(input);
    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Invalid assignment payload', errors });
    }

    return this.assignmentsService.createAssignment(input);
  }

  @Patch(':id/close')
  async closeAssignment(
    @Param('id') id: string,
    @Body('endDate') endDate: string,
  ) {
    if (!endDate) {
      throw new BadRequestException({
        message: 'Invalid payload',
        errors: ['endDate is required'],
      });
    }

    return this.assignmentsService.closeAssignment(id, endDate);
  }
}
