import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  CUSTOMER_TYPES,
  PRODUCT_CODES,
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
    const rows: PriceRow[] = await this.prisma.productPrice.findMany();
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
      for (const productCode of PRODUCT_CODES) {
        const amount = prices?.get(productCode);
        if (amount === undefined) {
          throw new InternalServerErrorException(
            `Missing price for productCode=${productCode} customerType=${customerType}`,
          );
        }
        table[customerType][productCode] = amount;
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
