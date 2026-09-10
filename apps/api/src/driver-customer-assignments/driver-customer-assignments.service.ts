import { Injectable } from '@nestjs/common';
import {
  DRIVER_CUSTOMER_ASSIGNMENT_HISTORY_PAGE_SIZE,
  type CreateDriverCustomerAssignmentInput,
  type CustomerRecord,
  type CustomerType,
  type DriverCustomerAssignmentHistoryQuery,
  type DriverCustomerAssignmentHistoryResponse,
  type DriverCustomerAssignmentRecord,
} from '@distribuidor/shared';
import { PrismaService } from '../prisma/prisma.service';

type CustomerRow = {
  id: string;
  name: string;
  customerType: string;
  zoneRef: { id: string; name: string } | null;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type EntryRow = {
  position: number;
  customer: CustomerRow;
};

type AssignmentRow = {
  id: string;
  driverId: string;
  date: Date;
  createdAt: Date;
  updatedAt: Date;
  entries: EntryRow[];
};

/** Las asignaciones se razonan por dia entero, no por instante. */
const toUtcDay = (value: string): Date => {
  const parsed = new Date(value);
  return new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()),
  );
};

const formatDay = (value: Date): string => value.toISOString().slice(0, 10);

/**
 * El nombre para mostrar de la zona sale de la relacion: la columna sombra
 * `Customer.zone` ya no existe. Es el mismo include que usa `CustomersService`,
 * y esta es la unica otra consulta que arma un `CustomerRecord`.
 */
const ENTRIES_INCLUDE = {
  entries: {
    include: {
      customer: { include: { zoneRef: { select: { id: true, name: true } } } },
    },
    orderBy: { position: 'asc' },
  },
} as const;

@Injectable()
export class DriverCustomerAssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reemplazo total transaccional: preservo la fila padre (upsert por
   * driverId+date, unica en el schema) y borro+recreo sus entries. Elegido
   * en vez de "borrar el parent entero y recrearlo" porque conserva el `id`/
   * `createdAt` de la asignacion a traves de ediciones sucesivas, sin cambiar
   * el comportamiento observable (Spec: full-replace, sin merge).
   * `customerIds: []` es un estado valido: la fila padre queda sin entries,
   * no se borra.
   */
  async replaceAssignment(
    input: CreateDriverCustomerAssignmentInput,
  ): Promise<DriverCustomerAssignmentRecord> {
    const date = toUtcDay(input.date);

    return this.prisma.$transaction(async (tx) => {
      const assignment = (await tx.driverCustomerAssignment.upsert({
        where: { driverId_date: { driverId: input.driverId, date } },
        update: {},
        create: { driverId: input.driverId, date },
      })) as AssignmentRow;

      await tx.driverCustomerAssignmentEntry.deleteMany({
        where: { assignmentId: assignment.id },
      });

      if (input.customerIds.length > 0) {
        await tx.driverCustomerAssignmentEntry.createMany({
          data: input.customerIds.map((customerId, index) => ({
            assignmentId: assignment.id,
            customerId,
            position: index,
          })),
        });
      }

      const withEntries = (await tx.driverCustomerAssignment.findUnique({
        where: { id: assignment.id },
        include: ENTRIES_INCLUDE,
      })) as AssignmentRow;

      return this.toRecord(withEntries);
    });
  }

  /**
   * Lo que consume la app del chofer: los `CustomerRecord[]` ya resueltos, en
   * orden. Array vacio (nunca error/404) cuando no hay asignacion ese dia.
   */
  async getMyAssignment(driverId: string, date: string): Promise<CustomerRecord[]> {
    const assignment = (await this.prisma.driverCustomerAssignment.findUnique({
      where: { driverId_date: { driverId, date: toUtcDay(date) } },
      include: ENTRIES_INCLUDE,
    })) as AssignmentRow | null;

    if (!assignment) {
      return [];
    }

    return assignment.entries.map((entry) => this.toCustomerRecord(entry.customer));
  }

  /**
   * Historial paginado para la vista admin: siempre 15 por pagina, mas nuevo
   * primero. `page`, `total` y `totalPages` salen ya normalizados (page >= 1,
   * totalPages >= 1) para que el pager del dashboard no recalcule nada.
   * `count` y `findMany` comparten el mismo `where` para que el total sea
   * coherente con la pagina.
   */
  async listAssignmentHistory(
    query: DriverCustomerAssignmentHistoryQuery,
  ): Promise<DriverCustomerAssignmentHistoryResponse> {
    const pageSize = DRIVER_CUSTOMER_ASSIGNMENT_HISTORY_PAGE_SIZE;
    const requestedPage = query.page;
    const page =
      typeof requestedPage === 'number' &&
      Number.isFinite(requestedPage) &&
      requestedPage >= 1
        ? Math.floor(requestedPage)
        : 1;

    const dateRange: { gte?: Date; lte?: Date } = {};
    if (query.from) {
      dateRange.gte = toUtcDay(query.from);
    }
    if (query.to) {
      dateRange.lte = toUtcDay(query.to);
    }

    const where = {
      ...(query.driverId ? { driverId: query.driverId } : {}),
      ...(dateRange.gte || dateRange.lte ? { date: dateRange } : {}),
      ...(query.customerId
        ? { entries: { some: { customerId: query.customerId } } }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.driverCustomerAssignment.count({ where }),
      this.prisma.driverCustomerAssignment.findMany({
        where,
        include: {
          entries: {
            include: {
              // La zona sale siempre de la relacion: la columna sombra
              // `Customer.zone` ya no existe.
              customer: { include: { zoneRef: { select: { id: true, name: true } } } },
            },
            orderBy: { position: 'asc' },
          },
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }) as Promise<AssignmentRow[]>,
    ]);

    return {
      items: rows.map((row) => this.toRecord(row)),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async listAssignments(
    driverId?: string,
    date?: string,
  ): Promise<DriverCustomerAssignmentRecord[]> {
    const assignments = (await this.prisma.driverCustomerAssignment.findMany({
      where: {
        ...(driverId ? { driverId } : {}),
        ...(date ? { date: toUtcDay(date) } : {}),
      },
      include: ENTRIES_INCLUDE,
      orderBy: { date: 'desc' },
    })) as AssignmentRow[];

    return assignments.map((assignment) => this.toRecord(assignment));
  }

  private toRecord(assignment: AssignmentRow): DriverCustomerAssignmentRecord {
    return {
      id: assignment.id,
      driverId: assignment.driverId,
      date: formatDay(assignment.date),
      customers: assignment.entries.map((entry) => this.toCustomerRecord(entry.customer)),
      createdAt: assignment.createdAt.toISOString(),
      updatedAt: assignment.updatedAt.toISOString(),
    };
  }

  private toCustomerRecord(customer: CustomerRow): CustomerRecord {
    return {
      id: customer.id,
      name: customer.name,
      customerType: customer.customerType as CustomerType,
      zone: customer.zoneRef?.name ?? undefined,
      latitude: customer.latitude ?? undefined,
      longitude: customer.longitude ?? undefined,
      isActive: customer.isActive,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    };
  }
}
