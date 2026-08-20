import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type CreateTruckInput,
  type TruckRecord,
  type UpdateTruckInput,
} from '@distribuidor/shared';
import { PrismaService } from '../prisma/prisma.service';

export type { TruckRecord };

@Injectable()
export class TrucksService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Por defecto solo los activos. `includeInactive` existe para que una baja
   * no sea irreversible: sin verlos, no hay forma de volver a habilitarlos.
   */
  async listTrucks(includeInactive = false): Promise<TruckRecord[]> {
    const trucks = await this.prisma.truck.findMany({
      ...(includeInactive ? {} : { where: { isActive: true } }),
      orderBy: { code: 'asc' },
    });

    return trucks.map((truck) => this.toRecord(truck));
  }

  async getTruck(id: string): Promise<TruckRecord> {
    const truck = await this.prisma.truck.findUnique({ where: { id } });
    if (!truck) {
      throw new NotFoundException('Truck not found');
    }

    return this.toRecord(truck);
  }

  async createTruck(input: CreateTruckInput): Promise<TruckRecord> {
    const truck = await this.prisma.truck.create({
      data: {
        code: input.code.trim(),
        plate: input.plate.trim(),
        capacity: input.capacity,
        isActive: true,
      },
    });

    return this.toRecord(truck);
  }

  async updateTruck(id: string, input: UpdateTruckInput): Promise<TruckRecord> {
    await this.getTruck(id);

    // Solo viajan los campos presentes: un PATCH parcial no puede blanquear
    // lo que el que llama no menciono.
    const data: UpdateTruckInput = {};
    if (input.code !== undefined) {
      data.code = input.code.trim();
    }
    if (input.plate !== undefined) {
      data.plate = input.plate.trim();
    }
    if (input.capacity !== undefined) {
      data.capacity = input.capacity;
    }
    if (input.isActive !== undefined) {
      data.isActive = input.isActive;
    }

    try {
      const truck = await this.prisma.truck.update({ where: { id }, data });
      return this.toRecord(truck);
    } catch (error) {
      // `code` y `plate` son unique en el schema: la colision llega como P2002.
      if ((error as { code?: string })?.code === 'P2002') {
        throw new ConflictException('Truck code or plate already exists');
      }

      throw error;
    }
  }

  async deactivateTruck(id: string): Promise<void> {
    const truck = await this.prisma.truck.findUnique({ where: { id } });
    if (!truck) {
      throw new NotFoundException('Truck not found');
    }

    await this.prisma.truck.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private toRecord(truck: {
    id: string;
    code: string;
    plate: string;
    capacity: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): TruckRecord {
    return {
      id: truck.id,
      code: truck.code,
      plate: truck.plate,
      capacity: truck.capacity,
      isActive: truck.isActive,
      createdAt: truck.createdAt.toISOString(),
      updatedAt: truck.updatedAt.toISOString(),
    };
  }
}
