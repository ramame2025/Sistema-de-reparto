import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type AssignmentKind,
  type CreateAssignmentInput,
} from '@distribuidor/shared';
import { PrismaService } from '../prisma/prisma.service';

export type AssignmentRecord = {
  id: string;
  driverId: string;
  truckId: string;
  kind: AssignmentKind;
  startDate: string;
  endDate: string | null;
  createdAt: string;
};

/** Un dia del calendario de un camion, ya resuelto a un unico chofer. */
export type EffectiveDay = {
  date: string;
  driverId: string | null;
  assignmentId: string | null;
  kind: AssignmentKind | null;
};

/** Las dos capas que necesita el calendario: filas para editar, dias para pintar. */
export type TruckCalendar = {
  truckId: string;
  from: string;
  to: string;
  assignments: AssignmentRecord[];
  days: EffectiveDay[];
};

/** Lo que la app del chofer necesita saber al abrir: que camion maneja hoy. */
export type DriverTruckToday = {
  assignmentId: string;
  kind: AssignmentKind;
  truckId: string;
  code: string;
  plate: string;
  capacity: number;
  startDate: string;
  endDate: string | null;
};

export type AssignmentWarning = {
  code: 'driver_leaves_own_truck';
  message: string;
  truckId: string;
  from: string;
  to: string;
};

type AssignmentRow = {
  id: string;
  driverId: string;
  truckId: string;
  kind: AssignmentKind;
  startDate: Date;
  endDate: Date | null;
  createdAt: Date;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * La proyeccion recorre dia por dia, asi que la ventana tiene que estar
 * acotada: sin tope, un from/to de un siglo arma decenas de miles de entradas.
 */
const MAX_CALENDAR_DAYS = 366;

/** Las asignaciones se razonan por dia entero, no por instante. */
const toUtcDay = (value: Date | string): number => {
  const date = typeof value === 'string' ? new Date(value) : value;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

const formatDay = (dayMs: number): string =>
  new Date(dayMs).toISOString().slice(0, 10);

const coversDay = (assignment: AssignmentRow, dayMs: number): boolean =>
  toUtcDay(assignment.startDate) <= dayMs &&
  (assignment.endDate === null || toUtcDay(assignment.endDate) >= dayMs);

@Injectable()
export class DriverTruckAssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async createAssignment(
    input: CreateAssignmentInput,
  ): Promise<AssignmentRecord> {
    await this.assertDriverIsChofer(input.driverId);

    const startDate = new Date(input.startDate);
    const endDate = input.endDate ? new Date(input.endDate) : null;

    return this.prisma.$transaction(async (tx) => {
      const driverOverlap = await tx.driverTruckAssignment.findFirst({
        where: this.overlapWhere(
          { driverId: input.driverId },
          input.kind,
          startDate,
          endDate,
        ),
      });
      if (driverOverlap) {
        throw new ConflictException(
          `Driver already has an overlapping ${input.kind} assignment`,
        );
      }

      const truckOverlap = await tx.driverTruckAssignment.findFirst({
        where: this.overlapWhere(
          { truckId: input.truckId },
          input.kind,
          startDate,
          endDate,
        ),
      });
      if (truckOverlap) {
        throw new ConflictException(
          `Truck already has an overlapping ${input.kind} assignment`,
        );
      }

      const created = await tx.driverTruckAssignment.create({
        data: {
          driverId: input.driverId,
          truckId: input.truckId,
          kind: input.kind,
          startDate,
          endDate,
        },
      });

      return this.toRecord(created);
    });
  }

  /**
   * Avisos que el calendario del camion no puede mostrar por si solo: mandar a
   * un chofer a cubrir otro camion deja el suyo sin nadie esos dias, y eso no
   * se ve desde la pantalla del camion destino.
   */
  async previewAssignment(
    input: CreateAssignmentInput,
  ): Promise<AssignmentWarning[]> {
    if (input.kind !== 'cobertura' || !input.endDate) {
      return [];
    }

    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);

    const ownTrucks = await this.prisma.driverTruckAssignment.findMany({
      where: {
        driverId: input.driverId,
        kind: 'titular',
        truckId: { not: input.truckId },
        startDate: { lte: endDate },
        OR: [{ endDate: null }, { endDate: { gte: startDate } }],
      },
    });

    const from = formatDay(toUtcDay(startDate));
    const to = formatDay(toUtcDay(endDate));

    return ownTrucks.map((assignment) => ({
      code: 'driver_leaves_own_truck' as const,
      message: `El chofer deja sin titular el camion ${assignment.truckId} del ${from} al ${to}.`,
      truckId: assignment.truckId,
      from,
      to,
    }));
  }

  async listAssignments(): Promise<AssignmentRecord[]> {
    const assignments = await this.prisma.driverTruckAssignment.findMany({
      orderBy: { startDate: 'desc' },
    });

    return assignments.map((assignment) => this.toRecord(assignment));
  }

  /**
   * Proyeccion dia a dia para pintar el calendario de un camion. No alcanza con
   * listar las filas: un titular abierto y una cobertura de 3 dias son 2 filas
   * pero 30 dias a resolver, y quien maneja cada dia sale de la regla de
   * especificidad, no de la fila.
   */
  async resolveEffectiveDays(
    truckId: string,
    from: string,
    to: string,
  ): Promise<EffectiveDay[]> {
    const { fromDay, toDay } = this.assertWindow(from, to);
    const assignments = await this.findInWindow(truckId, fromDay, toDay);

    return this.projectDays(assignments, fromDay, toDay);
  }

  /**
   * Calendario de un camion. Devuelve las filas crudas Y la proyeccion por dia
   * con UNA sola consulta: quien maneja cada dia sale de la regla de
   * especificidad, no de la fila, y esa regla vive aca y en ningun otro lado.
   */
  async getTruckCalendar(
    truckId: string,
    from: string,
    to: string,
  ): Promise<TruckCalendar> {
    const { fromDay, toDay } = this.assertWindow(from, to);
    const assignments = await this.findInWindow(truckId, fromDay, toDay);

    return {
      truckId,
      from: formatDay(fromDay),
      to: formatDay(toDay),
      assignments: assignments.map((assignment) => this.toRecord(assignment)),
      days: this.projectDays(assignments, fromDay, toDay),
    };
  }

  /** Que camion maneja un chofer en una fecha. Es lo que consume la app movil. */
  async resolveAssignmentForDriverOnDate(
    driverId: string,
    date: string,
  ): Promise<AssignmentRecord | null> {
    const dayMs = toUtcDay(date);

    const assignments = (await this.prisma.driverTruckAssignment.findMany({
      where: {
        driverId,
        startDate: { lte: new Date(dayMs) },
        OR: [{ endDate: null }, { endDate: { gte: new Date(dayMs) } }],
      },
    })) as AssignmentRow[];

    const winner = this.pickMostSpecific(
      assignments.filter((assignment) => coversDay(assignment, dayMs)),
    );

    return winner ? this.toRecord(winner) : null;
  }

  /**
   * Resuelve el camion de un chofer en una fecha y lo devuelve ya resuelto con
   * los datos del camion, para que la app no tenga que encadenar dos llamadas.
   */
  async resolveMyTruckForDate(
    driverId: string,
    date: string,
  ): Promise<DriverTruckToday | null> {
    const assignment = await this.resolveAssignmentForDriverOnDate(driverId, date);
    if (!assignment) {
      return null;
    }

    const truck = await this.prisma.truck.findUnique({
      where: { id: assignment.truckId },
    });

    // Un camion dado de baja no habilita ventas, aunque la asignacion siga viva.
    if (!truck || !truck.isActive) {
      return null;
    }

    return {
      assignmentId: assignment.id,
      kind: assignment.kind,
      truckId: truck.id,
      code: truck.code,
      plate: truck.plate,
      capacity: truck.capacity,
      startDate: assignment.startDate,
      endDate: assignment.endDate,
    };
  }

  /**
   * Version por lote de `resolveAssignmentForDriverOnDate`, con UNA sola
   * consulta: la pantalla de usuarios lista N choferes y preguntar de a uno
   * seria N+1. Los choferes sin asignacion ese dia simplemente no aparecen en
   * el Map.
   */
  async resolveAssignmentsForDriversOnDate(
    driverIds: string[],
    date: string,
  ): Promise<Map<string, AssignmentRecord>> {
    const resolved = new Map<string, AssignmentRecord>();

    if (driverIds.length === 0) {
      return resolved;
    }

    const dayMs = toUtcDay(date);

    const assignments = (await this.prisma.driverTruckAssignment.findMany({
      where: {
        driverId: { in: driverIds },
        startDate: { lte: new Date(dayMs) },
        OR: [{ endDate: null }, { endDate: { gte: new Date(dayMs) } }],
      },
    })) as AssignmentRow[];

    for (const driverId of driverIds) {
      const winner = this.pickMostSpecific(
        assignments.filter(
          (assignment) =>
            assignment.driverId === driverId && coversDay(assignment, dayMs),
        ),
      );

      if (winner) {
        resolved.set(driverId, this.toRecord(winner));
      }
    }

    return resolved;
  }

  async closeAssignment(
    id: string,
    endDate: string,
  ): Promise<AssignmentRecord> {
    const newEndDate = new Date(endDate);

    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.driverTruckAssignment.findUnique({
        where: { id },
      });
      if (!assignment) {
        throw new NotFoundException('Assignment not found');
      }

      if (newEndDate < assignment.startDate) {
        throw new BadRequestException('endDate must not be before startDate');
      }

      const driverOverlap = await tx.driverTruckAssignment.findFirst({
        where: {
          id: { not: id },
          ...this.overlapWhere(
            { driverId: assignment.driverId },
            assignment.kind,
            assignment.startDate,
            newEndDate,
          ),
        },
      });
      if (driverOverlap) {
        throw new ConflictException(
          'Driver already has an overlapping assignment',
        );
      }

      const truckOverlap = await tx.driverTruckAssignment.findFirst({
        where: {
          id: { not: id },
          ...this.overlapWhere(
            { truckId: assignment.truckId },
            assignment.kind,
            assignment.startDate,
            newEndDate,
          ),
        },
      });
      if (truckOverlap) {
        throw new ConflictException(
          'Truck already has an overlapping assignment',
        );
      }

      const updated = await tx.driverTruckAssignment.update({
        where: { id },
        data: { endDate: newEndDate },
      });

      return this.toRecord(updated);
    });
  }

  async findAssignmentForTruckOnDate(
    truckId: string,
    date: string,
  ): Promise<AssignmentRecord | null> {
    const targetDate = new Date(date);
    const assignment = await this.prisma.driverTruckAssignment.findFirst({
      where: {
        truckId,
        startDate: { lte: targetDate },
        OR: [{ endDate: null }, { endDate: { gte: targetDate } }],
      },
      orderBy: { startDate: 'desc' },
    });

    return assignment ? this.toRecord(assignment) : null;
  }

  private assertWindow(from: string, to: string): { fromDay: number; toDay: number } {
    const fromDay = toUtcDay(from);
    const toDay = toUtcDay(to);

    if (Number.isNaN(fromDay) || Number.isNaN(toDay)) {
      throw new BadRequestException('from and to must be valid dates');
    }

    if (toDay < fromDay) {
      throw new BadRequestException('to must not be before from');
    }

    if (toDay - fromDay > (MAX_CALENDAR_DAYS - 1) * DAY_MS) {
      throw new BadRequestException(
        `the window must not exceed ${MAX_CALENDAR_DAYS} days`,
      );
    }

    return { fromDay, toDay };
  }

  private async findInWindow(
    truckId: string,
    fromDay: number,
    toDay: number,
  ): Promise<AssignmentRow[]> {
    return (await this.prisma.driverTruckAssignment.findMany({
      where: {
        truckId,
        startDate: { lte: new Date(toDay) },
        OR: [{ endDate: null }, { endDate: { gte: new Date(fromDay) } }],
      },
      orderBy: { startDate: 'asc' },
    })) as AssignmentRow[];
  }

  private projectDays(
    assignments: AssignmentRow[],
    fromDay: number,
    toDay: number,
  ): EffectiveDay[] {
    const days: EffectiveDay[] = [];

    for (let dayMs = fromDay; dayMs <= toDay; dayMs += DAY_MS) {
      const winner = this.pickMostSpecific(
        assignments.filter((assignment) => coversDay(assignment, dayMs)),
      );

      days.push({
        date: formatDay(dayMs),
        driverId: winner?.driverId ?? null,
        assignmentId: winner?.id ?? null,
        kind: winner?.kind ?? null,
      });
    }

    return days;
  }

  private async assertDriverIsChofer(driverId: string): Promise<void> {
    const driver = await this.prisma.userAccount.findUnique({
      where: { id: driverId },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    // Un camion se le asigna a quien lo maneja; un admin no maneja.
    if (driver.role !== 'chofer') {
      throw new BadRequestException('Only a chofer can be assigned to a truck');
    }
  }

  /**
   * Gana la asignacion mas especifica: una cobertura le gana a un titular, y
   * entre dos del mismo tipo gana el rango mas corto. A igual rango, la mas
   * reciente.
   */
  private pickMostSpecific(candidates: AssignmentRow[]): AssignmentRow | null {
    if (candidates.length === 0) {
      return null;
    }

    const span = (assignment: AssignmentRow) =>
      assignment.endDate === null
        ? Number.POSITIVE_INFINITY
        : toUtcDay(assignment.endDate) - toUtcDay(assignment.startDate);

    return [...candidates].sort((a, b) => {
      if (a.kind !== b.kind) {
        return a.kind === 'cobertura' ? -1 : 1;
      }

      if (span(a) !== span(b)) {
        return span(a) - span(b);
      }

      return b.createdAt.getTime() - a.createdAt.getTime();
    })[0];
  }

  /**
   * Un conflicto solo existe entre asignaciones del MISMO tipo. Una cobertura
   * nunca choca contra un titular: lo pisa, que es justamente para lo que esta.
   */
  private overlapWhere(
    filter: Record<string, string>,
    kind: AssignmentKind,
    startDate: Date,
    endDate: Date | null,
  ) {
    return {
      ...filter,
      kind,
      startDate: endDate ? { lte: endDate } : undefined,
      OR: [{ endDate: null }, { endDate: { gte: startDate } }],
    };
  }

  private toRecord(assignment: AssignmentRow): AssignmentRecord {
    return {
      id: assignment.id,
      driverId: assignment.driverId,
      truckId: assignment.truckId,
      kind: assignment.kind,
      startDate: assignment.startDate.toISOString(),
      endDate: assignment.endDate ? assignment.endDate.toISOString() : null,
      createdAt: assignment.createdAt.toISOString(),
    };
  }
}
