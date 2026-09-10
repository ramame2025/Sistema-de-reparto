import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type CreateTruckInput,
  type ProductCode,
  type SetTruckCapacitiesInput,
  type TruckRecord,
  type UpdateTruckInput,
} from '@distribuidor/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';

export type { TruckRecord };

type TruckCapacityRow = {
  productCode: string;
  units: number;
};

type TruckRow = {
  id: string;
  code: string;
  plate: string;
  capacities: TruckCapacityRow[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * La grilla viaja SIEMPRE con el camion, y ordenada por el `sortOrder` del
 * producto: asi se lee en el mismo orden que el catalogo en todas las demas
 * pantallas. El desempate por codigo evita que dos productos con el mismo
 * `sortOrder` salgan en el orden que quiera la base.
 */
const CAPACITIES_INCLUDE = {
  include: {
    capacities: {
      select: { productCode: true, units: true },
      orderBy: [
        { product: { sortOrder: 'asc' as const } },
        { productCode: 'asc' as const },
      ],
    },
  },
};

@Injectable()
export class TrucksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productsService: ProductsService,
  ) {}

  /**
   * Por defecto solo los activos. `includeInactive` existe para que una baja
   * no sea irreversible: sin verlos, no hay forma de volver a habilitarlos.
   */
  async listTrucks(includeInactive = false): Promise<TruckRecord[]> {
    const trucks: TruckRow[] = await this.prisma.truck.findMany({
      ...(includeInactive ? {} : { where: { isActive: true } }),
      orderBy: { code: 'asc' },
      ...CAPACITIES_INCLUDE,
    });

    return trucks.map((truck) => this.toRecord(truck));
  }

  async getTruck(id: string): Promise<TruckRecord> {
    const truck = await this.findRow(id);
    if (!truck) {
      throw new NotFoundException('Truck not found');
    }

    return this.toRecord(truck);
  }

  /**
   * El camion nace SIN grilla de capacidad, y no es un olvido: la capacidad
   * por producto se carga aparte, con `setCapacities`. Mezclarla con el alta
   * obligaria a saber el detalle antes de poder registrar el camion.
   */
  async createTruck(input: CreateTruckInput): Promise<TruckRecord> {
    const truck: TruckRow = await this.prisma.truck.create({
      data: {
        code: input.code.trim(),
        plate: input.plate.trim(),
        isActive: true,
      },
      ...CAPACITIES_INCLUDE,
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
    if (input.isActive !== undefined) {
      data.isActive = input.isActive;
    }

    try {
      const truck: TruckRow = await this.prisma.truck.update({
        where: { id },
        data,
        ...CAPACITIES_INCLUDE,
      });
      return this.toRecord(truck);
    } catch (error) {
      // `code` y `plate` son unique en el schema: la colision llega como P2002.
      if ((error as { code?: string })?.code === 'P2002') {
        throw new ConflictException('Truck code or plate already exists');
      }

      throw error;
    }
  }

  /**
   * Reemplazo TOTAL de la grilla, nunca un merge, y en una sola transaccion.
   * Es el mismo contrato que `DriverCustomerAssignment`, por el mismo motivo:
   * si el PUT fusionara, "sacar este producto del camion" no se podria
   * expresar con ningun payload.
   *
   * Una fila con `units: 0` se GUARDA: dice "este producto no viaja en este
   * camion", que no es lo mismo que no haber contestado por el.
   */
  async setCapacities(
    id: string,
    input: SetTruckCapacitiesInput,
  ): Promise<TruckRecord> {
    // Primero el camion (404) y despues el catalogo (400): las dos
    // validaciones ocurren ANTES de borrar nada, asi que un codigo invalido
    // no deja la grilla vacia a medio camino.
    await this.getTruck(id);
    await this.productsService.assertProductCodesExist(
      input.capacities.map((entry) => entry.productCode),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.truckCapacity.deleteMany({ where: { truckId: id } });

      if (input.capacities.length > 0) {
        await tx.truckCapacity.createMany({
          data: input.capacities.map((entry) => ({
            truckId: id,
            productCode: entry.productCode,
            units: entry.units,
          })),
        });
      }
    });

    return this.getTruck(id);
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

  private async findRow(id: string): Promise<TruckRow | null> {
    return this.prisma.truck.findUnique({
      where: { id },
      ...CAPACITIES_INCLUDE,
    });
  }

  private toRecord(truck: TruckRow): TruckRecord {
    return {
      id: truck.id,
      code: truck.code,
      plate: truck.plate,
      capacities: (truck.capacities ?? []).map((entry) => ({
        productCode: entry.productCode as ProductCode,
        units: entry.units,
      })),
      isActive: truck.isActive,
      createdAt: truck.createdAt.toISOString(),
      updatedAt: truck.updatedAt.toISOString(),
    };
  }
}
