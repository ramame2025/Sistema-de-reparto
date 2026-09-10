import { Injectable, NotFoundException } from '@nestjs/common';
import {
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
    // La tabla se arma con LAS FILAS QUE EXISTEN, agrupadas por el
    // `customerType` que hayan traido, sea cual sea. No se recorre ninguna
    // lista fija de categorias ni de productos: las categorias las define el
    // admin en runtime, y una recien creada NACE SIN PRECIOS -- no aparece en
    // la tabla hasta que tenga su primera celda, que es exactamente lo que
    // pasa.
    //
    // Nada se filtra por `isActive`, ni de producto ni de categoria: una venta
    // encolada en el telefono antes de que el admin lo diera de baja tiene que
    // poder sincronizar despues, y para eso necesita su precio.
    const rows: PriceRow[] = await this.prisma.productPrice.findMany({
      where: { validFrom: { lte: at } },
      orderBy: { validFrom: 'asc' },
    });

    // Las filas vienen ordenadas por validFrom ascendente, asi que la ultima
    // que se escribe de cada combinacion es la vigente en `at`.
    const table: PriceTable = {};
    for (const row of rows) {
      const cells: Partial<Record<ProductCode, number>> =
        table[row.customerType] ?? {};
      cells[row.productCode] = row.amount;
      table[row.customerType] = cells;
    }

    // El agujero se omite, no rompe: una categoria puede existir sin todos sus
    // precios cargados, asi que un par sin precio es un estado legitimo del
    // sistema y no una tabla corrupta.
    //
    // Fallar aca convertia ese agujero en un 500 para TODAS las ventas,
    // incluidas las de las categorias con la lista completa. La tabla informa
    // lo que hay; la falla pertenece al momento de cotizar, que es el unico
    // que sabe que par se necesitaba y puede nombrarlo.
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
