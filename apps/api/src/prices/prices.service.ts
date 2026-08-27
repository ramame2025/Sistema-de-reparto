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
  updatedAt: Date;
};

@Injectable()
export class PricesService {
  constructor(private readonly prisma: PrismaService) {}

  async getPriceTable(): Promise<PriceTable> {
    // TODOS los productos, activos y dados de baja. Una venta encolada en el
    // telefono antes de que el producto se ocultara tiene que poder
    // sincronizar despues, y para eso necesita su precio.
    const [products, rows] = await Promise.all([
      this.prisma.product.findMany({ select: { code: true } }) as Promise<
        { code: string }[]
      >,
      this.prisma.productPrice.findMany() as Promise<PriceRow[]>,
    ]);

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
            `Missing price for productCode=${code} customerType=${customerType}`,
          );
        }
        table[customerType][code] = amount;
      }
    }

    return table;
  }

  async listPrices(): Promise<ProductPriceRecord[]> {
    const rows: PriceRow[] = await this.prisma.productPrice.findMany({
      orderBy: [{ customerType: 'asc' }, { productCode: 'asc' }],
    });

    return rows.map((row) => this.toRecord(row));
  }

  async updatePrice(
    productCode: ProductCode,
    customerType: CustomerType,
    amount: number,
  ): Promise<ProductPriceRecord> {
    const existing = await this.prisma.productPrice.findUnique({
      where: { productCode_customerType: { productCode, customerType } },
    });
    if (!existing) {
      throw new NotFoundException('Price not found');
    }

    const updated: PriceRow = await this.prisma.productPrice.update({
      where: { productCode_customerType: { productCode, customerType } },
      data: { amount },
    });

    return this.toRecord(updated);
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
