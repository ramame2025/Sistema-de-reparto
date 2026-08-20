import { Injectable, NotFoundException } from '@nestjs/common';
import { type CreateTruckInput } from '@distribuidor/shared';
import { PrismaService } from '../prisma/prisma.service';

export type TruckRecord = {
  id: string;
  code: string;
  plate: string;
  capacity: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class TrucksService {
  constructor(private readonly prisma: PrismaService) {}

  async listTrucks(): Promise<TruckRecord[]> {
    const trucks = await this.prisma.truck.findMany({
      where: { isActive: true },
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
