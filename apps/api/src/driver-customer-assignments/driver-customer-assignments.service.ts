import { Injectable } from '@nestjs/common';
import type {
  CreateDriverCustomerAssignmentInput,
  CustomerRecord,
  CustomerType,
  DriverCustomerAssignmentRecord,
} from '@distribuidor/shared';
import { PrismaService } from '../prisma/prisma.service';

type CustomerRow = {
  id: string;
  name: string;
  customerType: string;
  zone: string | null;
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
        include: {
          entries: { include: { customer: true }, orderBy: { position: 'asc' } },
        },
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
      include: {
        entries: { include: { customer: true }, orderBy: { position: 'asc' } },
      },
    })) as AssignmentRow | null;

    if (!assignment) {
      return [];
    }

    return assignment.entries.map((entry) => this.toCustomerRecord(entry.customer));
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
      include: {
        entries: { include: { customer: true }, orderBy: { position: 'asc' } },
      },
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
      zone: customer.zone ?? undefined,
      latitude: customer.latitude ?? undefined,
      longitude: customer.longitude ?? undefined,
      isActive: customer.isActive,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    };
  }
}
