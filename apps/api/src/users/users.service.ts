import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type CreateUserInput,
  type CurrentTruckSummary,
  type UserSummary,
} from '@distribuidor/shared';
import type { UserRole } from '@prisma/client';
import { hash } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { DriverTruckAssignmentsService } from '../driver-truck-assignments/driver-truck-assignments.service';

/** El panel muestra la asignacion vigente HOY, en zona del negocio. */
const BUSINESS_TIME_ZONE = 'America/Argentina/Buenos_Aires';

const todayInBusinessZone = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE }).format(new Date());

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assignments: DriverTruckAssignmentsService,
  ) {}

  async listUsers(): Promise<UserSummary[]> {
    const users = await this.prisma.userAccount.findMany({
      orderBy: { createdAt: 'asc' },
    });

    // Solo los choferes manejan: preguntar por el camion de un admin no tiene
    // sentido, y por eso su `currentTruck` queda ausente en vez de null.
    const driverIds = users.filter((user) => user.role === 'chofer').map((user) => user.id);
    const assigned = await this.assignments.resolveAssignmentsForDriversOnDate(
      driverIds,
      todayInBusinessZone(),
    );

    const truckIds = [...new Set([...assigned.values()].map((a) => a.truckId))];
    const trucksById = new Map(
      truckIds.length === 0
        ? []
        : (
            await this.prisma.truck.findMany({
              where: { id: { in: truckIds } },
              select: { id: true, code: true },
            })
          ).map((truck) => [truck.id, truck.code] as const),
    );

    return users.map((user) => {
      const base = {
        id: user.id,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      };

      if (user.role !== 'chofer') {
        return base;
      }

      const assignment = assigned.get(user.id);
      const currentTruck: CurrentTruckSummary | null = assignment
        ? {
            truckId: assignment.truckId,
            code: trucksById.get(assignment.truckId) ?? assignment.truckId,
            kind: assignment.kind,
          }
        : null;

      return { ...base, currentTruck };
    });
  }

  async createUser(input: CreateUserInput): Promise<UserSummary> {
    const username = input.username.trim();
    const existing = await this.prisma.userAccount.findUnique({ where: { username } });

    if (existing) {
      throw new ConflictException('Username already exists');
    }

    const passwordHash = await hash(input.password, 10);
    const user = await this.prisma.userAccount.create({
      data: {
        username,
        passwordHash,
        role: input.role as UserRole,
      },
    });

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  async changePassword(id: string, password: string): Promise<void> {
    const user = await this.prisma.userAccount.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const passwordHash = await hash(password, 10);
    await this.prisma.userAccount.update({
      where: { id },
      data: { passwordHash },
    });
  }

  async deleteUser(id: string, actorUsername?: string): Promise<void> {
    const user = await this.prisma.userAccount.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (actorUsername && user.username === actorUsername) {
      throw new ConflictException('Cannot delete current session user');
    }

    if (user.role === 'admin') {
      const adminCount = await this.prisma.userAccount.count({ where: { role: 'admin' } });
      if (adminCount <= 1) {
        throw new ConflictException('Cannot delete the last admin user');
      }
    }

    await this.prisma.userAccount.delete({ where: { id } });
  }
}
