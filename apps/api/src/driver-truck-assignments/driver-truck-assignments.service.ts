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
    const fromDay = toUtcDay(from);
    const toDay = toUtcDay(to);

    if (toDay < fromDay) {
      throw new BadRequestException('to must not be before from');
    }

    const assignments = (await this.prisma.driverTruckAssignment.findMany({
      where: {
        truckId,
        startDate: { lte: new Date(toDay) },
        OR: [{ endDate: null }, { endDate: { gte: new Date(fromDay) } }],
      },
      orderBy: { startDate: 'asc' },
    })) as AssignmentRow[];

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
