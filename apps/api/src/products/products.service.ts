import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
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

    // Las categorias se leen EN EL MOMENTO DEL PEDIDO, no de una lista fija de
    // tres: el admin pudo crear una hace un minuto. Solo las activas, porque
    // exigirle precio a una categoria dada de baja seria pedir un dato muerto.
    const categories: { code: string }[] =
      await this.prisma.customerCategory.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { code: true },
      });

    // "Nace completo o no nace" sigue rigiendo para el producto. Un producto
    // sin uno de sus precios ya no rompe la tabla entera -- `getPriceTableAt`
    // omite la celda faltante -- pero deja al chofer sin poder venderlo a esa
    // categoria, y con un error que solo aparece frente al cliente. Que se
    // evite aca es barato; que aparezca en la calle no.
    //
    // El caso inverso, una categoria NUEVA, es deliberadamente el opuesto:
    // nace sin ningun precio y nadie backfillea los productos existentes. La
    // asimetria es intencional -- crear un producto es un formulario que el
    // admin esta completando ahora, y crear una categoria abre una columna
    // entera que se llena despues, celda por celda.
    const missing = categories
      .map((category) => category.code)
      .filter((code) => input.prices?.[code] === undefined);

    if (missing.length > 0) {
      // La categoria culpable va en el mensaje, no solo en `errors`: quien lee
      // un log o un banner tiene que saber CUAL falta sin abrir el JSON.
      throw new BadRequestException({
        message: `Missing price for customerType: ${missing.join(', ')}`,
        errors: missing.map((code) => `prices.${code} is required`),
      });
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

      // Misma transaccion, a proposito: el producto y sus precios nacen juntos
      // o no nace ninguno.
      await tx.productPrice.createMany({
        data: categories.map((category) => ({
          productCode: code,
          customerType: category.code,
          amount: input.prices[category.code],
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
