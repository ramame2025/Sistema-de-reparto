import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateCustomerCategoryInput,
  CustomerCategoryRecord,
  UpdateCustomerCategoryInput,
} from '@distribuidor/shared';
import { PrismaService } from '../prisma/prisma.service';

export type { CustomerCategoryRecord };

export type ListCustomerCategoriesOptions = {
  /** El admin ve todas; el chofer solo las vigentes. */
  includeInactive?: boolean;
};

type CustomerCategoryRow = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class CustomerCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async listCategories(
    options: ListCustomerCategoriesOptions = {},
  ): Promise<CustomerCategoryRecord[]> {
    // Se ordena por `sortOrder` y se desempata por nombre: el admin decide el
    // orden, y las categorias que nunca reordeno quedan alfabeticas en vez de
    // salir en el orden en que la base las devuelva.
    const categories: CustomerCategoryRow[] =
      await this.prisma.customerCategory.findMany({
        where: options.includeInactive ? {} : { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });

    return categories.map((category) => this.toRecord(category));
  }

  /**
   * La categoria NACE SIN PRECIOS, y es una decision explicita del duenio: no
   * se copia la lista de otra categoria ni se backfillea nada. Los productos
   * existentes simplemente no tienen celda para ella hasta que el admin la
   * cargue, y `/admin/productos` la muestra vacia y en rojo. Un precio
   * heredado miente en silencio; una celda vacia se ve.
   */
  async createCategory(
    input: CreateCustomerCategoryInput,
  ): Promise<CustomerCategoryRecord> {
    const code = input.code.trim();

    // Una categoria dada de baja sigue ocupando su codigo: las ventas viejas
    // lo tienen congelado y los clientes la siguen referenciando, asi que
    // reusarlo mezclaria dos categorias distintas en un mismo historial.
    const existing = await this.prisma.customerCategory.findUnique({
      where: { code },
    });
    if (existing) {
      throw new ConflictException(`Customer category code ${code} already exists`);
    }

    const created: CustomerCategoryRow = await this.prisma.customerCategory.create({
      data: {
        code,
        name: input.name.trim(),
        sortOrder: input.sortOrder ?? 0,
        isActive: true,
      },
    });

    return this.toRecord(created);
  }

  async updateCategory(
    id: string,
    input: UpdateCustomerCategoryInput,
  ): Promise<CustomerCategoryRecord> {
    const category = await this.prisma.customerCategory.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException('Customer category not found');
    }

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;

    const updated: CustomerCategoryRow = await this.prisma.customerCategory.update({
      where: { id },
      data,
    });

    return this.toRecord(updated);
  }

  /**
   * Verifica que cada codigo exista en el catalogo de categorias.
   * Deliberadamente NO exige que este activa, igual que
   * `ProductsService.assertProductCodesExist` y por el mismo motivo: ese
   * string llega dentro de una venta encolada en el telefono ANTES de que el
   * admin diera de baja la categoria, y rechazarla perderia una venta real.
   * `isActive` decide que se le OFRECE al chofer, no que se le acepta.
   *
   * Es la regla opuesta a la de zona (`CustomersService.resolveZone`), que si
   * rechaza lo dado de baja, porque una zona se elige de una lista viva.
   */
  async assertCategoryCodesExist(codes: string[]): Promise<void> {
    const distinct = [...new Set(codes)];
    if (distinct.length === 0) {
      return;
    }

    const found: { code: string }[] = await this.prisma.customerCategory.findMany({
      where: { code: { in: distinct } },
      select: { code: true },
    });
    const known = new Set(found.map((row) => row.code));
    const unknown = distinct.filter((code) => !known.has(code));

    if (unknown.length > 0) {
      // El codigo culpable va en el mensaje, no solo en `errors`: quien lee un
      // log o un banner de error tiene que saber CUAL fallo sin abrir el JSON.
      throw new BadRequestException({
        message: `Unknown customerType: ${unknown.join(', ')}`,
        errors: unknown.map((code) => `customerType ${code} does not exist`),
      });
    }
  }

  /**
   * Verifica que la categoria exista Y este vigente.
   *
   * Es el caso de escritorio: asignarle una categoria a un cliente se hace
   * eligiendo de una lista viva, en el panel o en el alta rapida del chofer,
   * que es online. Una categoria dada de baja ahi no es una sincronizacion
   * tardia, es un error -- mismo criterio que la zona.
   */
  async assertCategoryAssignable(code: string): Promise<void> {
    const category: { code: string; isActive: boolean } | null =
      await this.prisma.customerCategory.findUnique({
        where: { code },
        select: { code: true, isActive: true },
      });

    if (!category) {
      throw new BadRequestException({
        message: `Unknown customerType: ${code}`,
        errors: [`customerType ${code} does not exist`],
      });
    }

    if (!category.isActive) {
      throw new BadRequestException({
        message: `Customer category ${code} is not active`,
        errors: [`customerType ${code} is not active`],
      });
    }
  }

  private toRecord(category: CustomerCategoryRow): CustomerCategoryRecord {
    return {
      id: category.id,
      code: category.code,
      name: category.name,
      isActive: category.isActive,
      sortOrder: category.sortOrder,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
    };
  }
}
