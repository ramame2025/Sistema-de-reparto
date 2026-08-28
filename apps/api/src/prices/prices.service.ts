import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  CUSTOMER_TYPES,
  type CustomerType,
  type PriceTable,
  type ProductCode,
} from '@distribuidor/shared';
import { PrismaService } from '../prisma/prisma.service';

export type ProductPriceRecord = {
  id: string;
  productCode: ProductCode;
  customerType: CustomerType;
  amount: number;
  updatedAt: string;
};

type PriceRow = {
  id: string;
  productCode: ProductCode;
  customerType: CustomerType;
  amount: number;
  validFrom: Date;
  updatedAt: Date;
};

@Injectable()
export class PricesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Los precios vigentes ahora. */
  async getPriceTable(): Promise<PriceTable> {
    return this.getPriceTableAt(new Date());
  }

  /**
   * Los precios vigentes en una fecha dada: para cada producto y tipo de
   * cliente, la version mas reciente cuyo `validFrom` no sea posterior a esa
   * fecha.
   *
   * Es lo que permite que una venta encolada el lunes y sincronizada el
   * miercoles se grabe al precio del lunes, que es el que el chofer cobro.
   */
  async getPriceTableAt(at: Date): Promise<PriceTable> {
    // TODOS los productos, activos y dados de baja. Una venta encolada en el
    // telefono antes de que el producto se ocultara tiene que poder
    // sincronizar despues, y para eso necesita su precio.
    const [products, rows] = await Promise.all([
      this.prisma.product.findMany({ select: { code: true } }) as Promise<
        { code: string }[]
      >,
      this.prisma.productPrice.findMany({
        where: { validFrom: { lte: at } },
        orderBy: { validFrom: 'asc' },
      }) as Promise<PriceRow[]>,
    ]);

    // Las filas vienen ordenadas por validFrom ascendente, asi que la ultima
    // que se escribe de cada combinacion es la vigente en `at`.
    const byCustomerType = new Map<CustomerType, Map<ProductCode, number>>();
    for (const row of rows) {
      if (!byCustomerType.has(row.customerType)) {
        byCustomerType.set(row.customerType, new Map());
      }
      byCustomerType.get(row.customerType)!.set(row.productCode, row.amount);
    }

    const table = {} as PriceTable;
    for (const customerType of CUSTOMER_TYPES) {
      const prices = byCustomerType.get(customerType);
      table[customerType] = {} as Record<ProductCode, number>;
      for (const { code } of products) {
        const amount = prices?.get(code);
        if (amount === undefined) {
          // Un producto sin precio no rompe su propia venta: rompe TODAS.
          // Por eso `createProduct` escribe producto y precios en la misma
          // transaccion, y por eso esto sigue siendo un error y no un cero.
          throw new InternalServerErrorException(
            `Missing price for productCode=${code} customerType=${customerType} at ${at.toISOString()}`,
          );
        }
        table[customerType][code] = amount;
      }
    }

    return table;
  }

  /**
   * Los precios VIGENTES, uno por producto y tipo de cliente.
   *
   * Con `ProductPrice` append-only, un findMany crudo devuelve todas las
   * versiones: listarlas tal cual mostraria el mismo producto repetido, con
   * precios distintos y sin decir cual rige. El historial completo es un
   * pedido distinto, y todavia no esta expuesto.
   */
  async listPrices(): Promise<ProductPriceRecord[]> {
    const now = new Date();
    const rows: PriceRow[] = await this.prisma.productPrice.findMany({
      where: { validFrom: { lte: now } },
      orderBy: [{ customerType: 'asc' }, { productCode: 'asc' }, { validFrom: 'asc' }],
    });

    // Ordenadas ascendente por validFrom, la ultima que se escribe de cada
    // combinacion es la vigente.
    const current = new Map<string, PriceRow>();
    for (const row of rows) {
      current.set(`${row.customerType}|${row.productCode}`, row);
    }

    return [...current.values()].map((row) => this.toRecord(row));
  }

  /**
   * Fija el precio a partir de `validFrom` INSERTANDO una version nueva.
   *
   * Nunca pisa la fila existente: esa fila es el precio al que ya se vendio, y
   * sobreescribirla reescribiria la historia de esas ventas.
   */
  async updatePrice(
    productCode: ProductCode,
    customerType: CustomerType,
    amount: number,
    validFrom: Date = new Date(),
  ): Promise<ProductPriceRecord> {
    const created: PriceRow = await this.prisma.productPrice.create({
      data: { productCode, customerType, amount, validFrom },
    });

    return this.toRecord(created);
  }

  private toRecord(row: PriceRow): ProductPriceRecord {
    return {
      id: row.id,
      productCode: row.productCode,
      customerType: row.customerType,
      amount: row.amount,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
