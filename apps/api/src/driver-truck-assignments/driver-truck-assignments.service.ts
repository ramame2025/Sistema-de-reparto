import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type CreateAssignmentInput } from '@distribuidor/shared';
import { PrismaService } from '../prisma/prisma.service';

export type AssignmentRecord = {
  id: string;
  driverId: string;
  truckId: string;
  startDate: string;
  endDate: string | null;
  createdAt: string;
};

type AssignmentRow = {
  id: string;
  driverId: string;
  truckId: string;
  startDate: Date;
  endDate: Date | null;
  createdAt: Date;
};

@Injectable()
export class DriverTruckAssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async createAssignment(input: CreateAssignmentInput): Promise<AssignmentRecord> {
    const startDate = new Date(input.startDate);
    const endDate = input.endDate ? new Date(input.endDate) : null;

    return this.prisma.$transaction(async (tx) => {
      const driverOverlap = await tx.driverTruckAssignment.findFirst({
        where: this.overlapWhere({ driverId: input.driverId }, startDate, endDate),
      });
      if (driverOverlap) {
        throw new ConflictException('Driver already has an overlapping assignment');
      }

      const truckOverlap = await tx.driverTruckAssignment.findFirst({
        where: this.overlapWhere({ truckId: input.truckId }, startDate, endDate),
      });
      if (truckOverlap) {
        throw new ConflictException('Truck already has an overlapping assignment');
      }

      const created = await tx.driverTruckAssignment.create({
        data: {
          driverId: input.driverId,
          truckId: input.truckId,
          startDate,
          endDate,
        },
      });

      return this.toRecord(created);
    });
  }

  async listAssignments(): Promise<AssignmentRecord[]> {
    const assignments = await this.prisma.driverTruckAssignment.findMany({
      orderBy: { startDate: 'desc' },
    });

    return assignments.map((assignment) => this.toRecord(assignment));
  }

  async closeAssignment(id: string, endDate: string): Promise<AssignmentRecord> {
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
          ...this.overlapWhere({ driverId: assignment.driverId }, assignment.startDate, newEndDate),
        },
      });
      if (driverOverlap) {
        throw new ConflictException('Driver already has an overlapping assignment');
      }

      const truckOverlap = await tx.driverTruckAssignment.findFirst({
        where: {
          id: { not: id },
          ...this.overlapWhere({ truckId: assignment.truckId }, assignment.startDate, newEndDate),
        },
      });
      if (truckOverlap) {
        throw new ConflictException('Truck already has an overlapping assignment');
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

  /**
   * A new assignment [startDate, endDate] overlaps an existing row when:
   *   existing.startDate <= (new.endDate ?? +Infinity) AND
   *   new.startDate <= (existing.endDate ?? +Infinity)
   * `endDate: null` models an open-ended assignment (no upper bound yet).
   */
  private overlapWhere(
    filter: Record<string, string>,
    startDate: Date,
    endDate: Date | null,
  ) {
    return {
      ...filter,
      startDate: endDate ? { lte: endDate } : undefined,
      OR: [{ endDate: null }, { endDate: { gte: startDate } }],
    };
  }

  private toRecord(assignment: AssignmentRow): AssignmentRecord {
    return {
      id: assignment.id,
      driverId: assignment.driverId,
      truckId: assignment.truckId,
      startDate: assignment.startDate.toISOString(),
      endDate: assignment.endDate ? assignment.endDate.toISOString() : null,
      createdAt: assignment.createdAt.toISOString(),
    };
  }
}
