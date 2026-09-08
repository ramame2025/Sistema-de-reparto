import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Put,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  type CreateDriverCustomerAssignmentInput,
  type DriverCustomerAssignmentHistoryResponse,
  type MyAssignedCustomersResponse,
  validateCreateDriverCustomerAssignmentInput,
} from '@distribuidor/shared';
import { Roles } from '../auth/roles.decorator';
import type { Request } from 'express';
import { DriverCustomerAssignmentsService } from './driver-customer-assignments.service';

type AuthRequest = Request & {
  user?: {
    sub?: string;
  };
};

/**
 * El reparto opera en Argentina: si el dia por defecto se tomara en UTC, un
 * chofer que abre la app a las 21:00 veria la lista del dia siguiente.
 */
const BUSINESS_TIME_ZONE = 'America/Argentina/Buenos_Aires';

const todayInBusinessZone = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE }).format(new Date());

@Controller('driver-customer-assignments')
@Roles('admin')
export class DriverCustomerAssignmentsController {
  constructor(
    private readonly assignmentsService: DriverCustomerAssignmentsService,
  ) {}

  @Get()
  async listAssignments(
    @Query('driverId') driverId?: string,
    @Query('date') date?: string,
  ) {
    return this.assignmentsService.listAssignments(driverId, date);
  }

  /**
   * Historial paginado (15 por pagina) para la vista admin. Filtros
   * opcionales por chofer, rango de fechas y cliente incluido en la lista.
   * Hereda el `admin`-only de la clase: no hay override de rol.
   */
  @Get('history')
  async listAssignmentHistory(
    @Query('driverId') driverId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('customerId') customerId?: string,
    @Query('page') page?: string,
  ): Promise<DriverCustomerAssignmentHistoryResponse> {
    const parsedPage = page ? Number.parseInt(page, 10) : NaN;

    return this.assignmentsService.listAssignmentHistory({
      driverId: driverId?.trim() || undefined,
      from: from?.trim() || undefined,
      to: to?.trim() || undefined,
      customerId: customerId?.trim() || undefined,
      page: Number.isNaN(parsedPage) ? undefined : parsedPage,
    });
  }

  /**
   * Que clientes visito hoy. La identidad sale SIEMPRE del token: un chofer
   * no puede pedir la lista de otro.
   */
  @Roles('admin', 'chofer')
  @Get('me')
  async getMyAssignment(
    @Req() req: AuthRequest,
    @Query('date') date?: string,
  ): Promise<MyAssignedCustomersResponse> {
    const driverId = req.user?.sub?.trim();

    if (!driverId) {
      throw new UnauthorizedException();
    }

    const resolvedDate = date || todayInBusinessZone();

    return {
      date: resolvedDate,
      customers: await this.assignmentsService.getMyAssignment(driverId, resolvedDate),
    };
  }

  @Put()
  async replaceAssignment(@Body() input: CreateDriverCustomerAssignmentInput) {
    const errors = validateCreateDriverCustomerAssignmentInput(input);
    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Invalid assignment payload', errors });
    }

    return this.assignmentsService.replaceAssignment(input);
  }
}
