import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { type CreateLoadManifestInput, type LoadManifestRecord } from '@distribuidor/shared';
import { ProductCode as PrismaProductCode, type LoadManifest, type LoadManifestItem } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LoadManifestsService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveTruck(truckId: string): Promise<string> {
    const truck = await this.prisma.truck.findUnique({ where: { id: truckId } });

    if (!truck) {
      throw new NotFoundException('Truck not found');
    }
    if (!truck.isActive) {
      throw new ConflictException('Truck is inactive');
    }

    return truck.id;
  }

  async createManifest(
    input: CreateLoadManifestInput,
    actorUsername?: string,
  ): Promise<LoadManifestRecord> {
    const truckId = await this.resolveTruck(input.truckId);
    const resolvedDriverName = (actorUsername ?? '').trim();
    const resolvedTruckCode = input.truckCode?.trim() || null;

    const manifest = await this.prisma.loadManifest.create({
      data: {
        driverName: resolvedDriverName,
        truckId,
        truckCode: resolvedTruckCode,
        photoRef: input.photoRef?.trim() || null,
        note: input.note?.trim() || null,
        items: {
          create: input.items.map((item) => ({
            productCode: item.productCode as PrismaProductCode,
            quantity: item.quantity,
          })),
        },
      },
      include: { items: true },
    });

    return this.toRecord(manifest);
  }

  async listManifests(): Promise<LoadManifestRecord[]> {
    const manifests = await this.prisma.loadManifest.findMany({
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });

    return manifests.map((manifest) => this.toRecord(manifest));
  }

  async listManifestsByDriver(driverName: string): Promise<LoadManifestRecord[]> {
    const manifests = await this.prisma.loadManifest.findMany({
      where: { driverName },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });

    return manifests.map((manifest) => this.toRecord(manifest));
  }

  private toRecord(manifest: LoadManifest & { items: LoadManifestItem[] }): LoadManifestRecord {
    return {
      id: manifest.id,
      createdAt: manifest.createdAt.toISOString(),
      driverName: manifest.driverName,
      truckId: manifest.truckId,
      truckCode: manifest.truckCode ?? undefined,
      items: manifest.items.map((item) => ({
        productCode: item.productCode,
        quantity: item.quantity,
      })),
      photoRef: manifest.photoRef ?? undefined,
      note: manifest.note ?? undefined,
    };
  }
}
