import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type CreateLoadManifestInput,
  type LoadManifestRecord,
  type ProductCode,
  type TruckDayStock,
  type TruckStockLine,
  type TruckStockSummary,
} from '@distribuidor/shared';
import { type LoadManifest, type LoadManifestItem } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';

/**
 * Instante UTC exclusivo del fin del dia `asOf` en horario de negocio
 * (America/Argentina/Buenos_Aires, UTC-3 fijo, sin DST): la medianoche local
 * del dia siguiente. `T23:59:59.999Z` corta 3hs antes de la medianoche real
 * en ART y excluye sistematicamente todo lo cargado entre las 21:00 y las
 * 23:59 hora argentina.
 */
function endOfBusinessDayUtc(asOf: string): Date {
  const [year, month, day] = asOf.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1, 3, 0, 0, 0));
}

/** El otro extremo del mismo dia habil: la medianoche local de `day`. */
function startOfBusinessDayUtc(day: string): Date {
  const [year, month, dayOfMonth] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, dayOfMonth, 3, 0, 0, 0));
}

@Injectable()
export class LoadManifestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productsService: ProductsService,
  ) {}

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
    // Igual que en las ventas: la forma la valida shared, la pertenencia al
    // catalogo solo la puede saber la base.
    await this.productsService.assertProductCodesExist(
      input.items.map((item) => item.productCode),
    );

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
            productCode: item.productCode,
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

  /**
   * Stock derivado (no persistido): cargado - vendido (solo ventas activas),
   * hasta el fin de `asOf` en horario de negocio (ART, UTC-3 fijo, sin DST).
   * Reducido en TS, no en SQL, siguiendo el mismo estilo que
   * `toRecord`/`priceSaleItems` en el resto del codigo.
   */
  async getTruckStock(truckId: string, asOf: string): Promise<TruckStockSummary> {
    const asOfBoundary = endOfBusinessDayUtc(asOf);

    const [loadedItems, soldItems] = await Promise.all([
      this.prisma.loadManifestItem.findMany({
        where: {
          manifest: { truckId, createdAt: { lt: asOfBoundary } },
        },
      }),
      this.prisma.saleItem.findMany({
        where: {
          sale: { truckId, status: 'active', createdAt: { lt: asOfBoundary } },
        },
      }),
    ]);

    const lines = await this.buildStockLines(loadedItems, soldItems);

    return { truckId, asOf, lines };
  }

  /**
   * Stock del DIA, no acumulado: el remito de `day` menos lo vendido ese mismo
   * dia. `getTruckStock` contesta otra pregunta (el saldo historico del
   * camion) y por eso no se toca: la portada del chofer necesita que los
   * numeros cierren contra el remito que el mismo cargo a la manana.
   */
  async getTruckStockForDay(truckId: string, day: string): Promise<TruckDayStock> {
    const createdAt = {
      gte: startOfBusinessDayUtc(day),
      lt: endOfBusinessDayUtc(day),
    };

    const [loadedItems, soldItems, lastManifest] = await Promise.all([
      this.prisma.loadManifestItem.findMany({
        where: { manifest: { truckId, createdAt } },
      }),
      this.prisma.saleItem.findMany({
        where: { sale: { truckId, status: 'active', createdAt } },
      }),
      // Un dia puede tener mas de un remito (recarga al mediodia). El ultimo
      // es el que le dice al chofer desde cuando valen estos numeros.
      this.prisma.loadManifest.findFirst({
        where: { truckId, createdAt },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    const lines = await this.buildStockLines(loadedItems, soldItems);

    return {
      truckId,
      date: day,
      manifestAt: lastManifest ? lastManifest.createdAt.toISOString() : null,
      lines,
    };
  }

  private async buildStockLines(
    loadedItems: { productCode: string; quantity: number }[],
    soldItems: { productCode: string; quantity: number }[],
  ): Promise<TruckStockLine[]> {
    const loadedByProduct = new Map<ProductCode, number>();
    for (const item of loadedItems) {
      const productCode = item.productCode as ProductCode;
      loadedByProduct.set(productCode, (loadedByProduct.get(productCode) ?? 0) + item.quantity);
    }

    const soldByProduct = new Map<ProductCode, number>();
    for (const item of soldItems) {
      const productCode = item.productCode as ProductCode;
      soldByProduct.set(productCode, (soldByProduct.get(productCode) ?? 0) + item.quantity);
    }

    // El catalogo sale de la base, no de una constante: si no, un producto
    // creado por el admin nunca apareceria en el stock del camion. Se listan
    // TODOS, tambien los dados de baja, porque un producto discontinuado que
    // todavia quedo cargado en el camion tiene que poder verse y venderse.
    const products: { code: string }[] = await this.prisma.product.findMany({
      select: { code: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });

    return products.map(({ code: productCode }) => {
      const loaded = loadedByProduct.get(productCode) ?? 0;
      const sold = soldByProduct.get(productCode) ?? 0;
      // No se clampea: un remaining negativo es un problema de datos real
      // (se vendio mas de lo cargado) y debe verse, no esconderse.
      return { productCode, loaded, sold, remaining: loaded - sold };
    });
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
