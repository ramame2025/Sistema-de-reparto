import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CUSTOMER_TYPES,
  type CreateProductInput,
  type ProductRecord,
  type UpdateProductInput,
} from '@distribuidor/shared';
import { PrismaService } from '../prisma/prisma.service';

export type { ProductRecord };

export type ListProductsOptions = {
  /** El admin ve el catalogo completo; el chofer solo lo que puede vender. */
  includeInactive?: boolean;
};

type ProductRow = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async listProducts(options: ListProductsOptions = {}): Promise<ProductRecord[]> {
    const products: ProductRow[] = await this.prisma.product.findMany({
      where: options.includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });

    return products.map((product) => this.toRecord(product));
  }

  async createProduct(input: CreateProductInput): Promise<ProductRecord> {
    const code = input.code.trim();

    // Un producto dado de baja sigue ocupando su codigo: sus ventas viejas lo
    // referencian, asi que reusarlo mezclaria dos productos distintos en un
    // mismo historial.
    const existing = await this.prisma.product.findUnique({ where: { code } });
    if (existing) {
      throw new ConflictException(`Product code ${code} already exists`);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const product: ProductRow = await tx.product.create({
        data: {
          code,
          name: input.name.trim(),
          sortOrder: input.sortOrder ?? 0,
          isActive: true,
        },
      });

      // Misma transaccion, a proposito: un producto sin sus tres precios haria
      // fallar getPriceTable, y con ella TODAS las ventas del sistema, no solo
      // las de este producto.
      await tx.productPrice.createMany({
        data: CUSTOMER_TYPES.map((customerType) => ({
          productCode: code,
          customerType,
          amount: input.prices[customerType],
        })),
      });

      return product;
    });

    return this.toRecord(created);
  }

  async updateProduct(id: string, input: UpdateProductInput): Promise<ProductRecord> {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;

    const updated: ProductRow = await this.prisma.product.update({
      where: { id },
      data,
    });

    return this.toRecord(updated);
  }

  /**
   * Verifica que cada codigo exista en el catalogo. Deliberadamente NO exige
   * que este activo: una venta encolada en el telefono antes de que el
   * producto se diera de baja tiene que poder sincronizar igual. `isActive`
   * decide que se le ofrece al chofer, no que se le acepta.
   */
  async assertProductCodesExist(codes: string[]): Promise<void> {
    const distinct = [...new Set(codes)];
    if (distinct.length === 0) {
      return;
    }

    const found: { code: string }[] = await this.prisma.product.findMany({
      where: { code: { in: distinct } },
      select: { code: true },
    });
    const known = new Set(found.map((row) => row.code));
    const unknown = distinct.filter((code) => !known.has(code));

    if (unknown.length > 0) {
      // El codigo culpable va en el mensaje, no solo en `errors`: quien lee un
      // log o un banner de error tiene que saber CUAL fallo sin abrir el JSON.
      throw new BadRequestException({
        message: `Unknown productCode: ${unknown.join(', ')}`,
        errors: unknown.map((code) => `productCode ${code} does not exist`),
      });
    }
  }

  private toRecord(product: ProductRow): ProductRecord {
    return {
      id: product.id,
      code: product.code,
      name: product.name,
      isActive: product.isActive,
      sortOrder: product.sortOrder,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  }
}
