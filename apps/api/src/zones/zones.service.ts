import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateZoneInput,
  UpdateZoneInput,
  ZoneRecord,
} from '@distribuidor/shared';
import { PrismaService } from '../prisma/prisma.service';

export type { ZoneRecord };

export type ListZonesOptions = {
  /** El admin ve el mapa completo; el chofer solo las zonas vigentes. */
  includeInactive?: boolean;
};

type ZoneRow = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class ZonesService {
  constructor(private readonly prisma: PrismaService) {}

  async listZones(options: ListZonesOptions = {}): Promise<ZoneRecord[]> {
    // Se ordena por `sortOrder` y se desempata por nombre: el admin decide el
    // orden, y las zonas que nunca reordeno quedan alfabeticas en vez de
    // salir en el orden en que la base las devuelva.
    const zones: ZoneRow[] = await this.prisma.zone.findMany({
      where: options.includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return zones.map((zone) => this.toRecord(zone));
  }

  async createZone(input: CreateZoneInput): Promise<ZoneRecord> {
    const code = input.code.trim();

    // Una zona dada de baja sigue ocupando su codigo: los clientes que la
    // referencian no dejan de hacerlo, asi que reusarlo mezclaria dos zonas
    // distintas bajo una misma clave.
    const existing = await this.prisma.zone.findUnique({ where: { code } });
    if (existing) {
      throw new ConflictException(`Zone code ${code} already exists`);
    }

    const created: ZoneRow = await this.prisma.zone.create({
      data: {
        code,
        name: input.name.trim(),
        sortOrder: input.sortOrder ?? 0,
        isActive: true,
      },
    });

    return this.toRecord(created);
  }

  async updateZone(id: string, input: UpdateZoneInput): Promise<ZoneRecord> {
    const zone = await this.prisma.zone.findUnique({ where: { id } });
    if (!zone) {
      throw new NotFoundException('Zone not found');
    }

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;

    const updated: ZoneRow = await this.prisma.zone.update({
      where: { id },
      data,
    });

    return this.toRecord(updated);
  }

  private toRecord(zone: ZoneRow): ZoneRecord {
    return {
      id: zone.id,
      code: zone.code,
      name: zone.name,
      isActive: zone.isActive,
      sortOrder: zone.sortOrder,
      createdAt: zone.createdAt.toISOString(),
      updatedAt: zone.updatedAt.toISOString(),
    };
  }
}
