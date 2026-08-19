import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  calculateSaleTotal,
  type CancelSaleInput,
  type CreateSaleInput,
  type CustomerType,
  type SaleAuditRecord,
  type SaleRecord,
  type UpdateSaleInput,
} from '@distribuidor/shared';
import {
  CustomerType as PrismaCustomerType,
  PaymentMethod as PrismaPaymentMethod,
  ProductCode as PrismaProductCode,
  SaleAuditAction as PrismaSaleAuditAction,
  type SaleAudit,
  type Sale,
  type SaleItem,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PricesService } from '../prices/prices.service';

type ResolvedSaleLinks = {
  customerType: CustomerType;
  customerName: string;
  customerId: string | null;
  truckId: string | null;
};

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricesService: PricesService,
  ) {}

  private async resolveCustomerAndTruck(
    input: CreateSaleInput,
  ): Promise<ResolvedSaleLinks> {
    let customerType = input.customerType;
    let customerName = input.customerName.trim();
    let customerId: string | null = null;

    if (input.customerId) {
      const customer = await this.prisma.customer.findUnique({
        where: { id: input.customerId },
      });

      if (!customer) {
        throw new NotFoundException('Customer not found');
      }
      if (!customer.isActive) {
        throw new ConflictException('Customer is inactive');
      }

      customerType = customer.customerType as CustomerType;
      customerName = customer.name;
      customerId = customer.id;
    }

    let truckId: string | null = null;

    if (input.truckId) {
      const truck = await this.prisma.truck.findUnique({
        where: { id: input.truckId },
      });

      if (!truck) {
        throw new NotFoundException('Truck not found');
      }
      if (!truck.isActive) {
        throw new ConflictException('Truck is inactive');
      }

      truckId = truck.id;
    }

    return { customerType, customerName, customerId, truckId };
  }

  async listSales(): Promise<SaleRecord[]> {
    const sales = await this.prisma.sale.findMany({
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });

    return sales.map((sale) => this.toSaleRecord(sale));
  }

  async listSalesByDriver(driverName: string): Promise<SaleRecord[]> {
    const sales = await this.prisma.sale.findMany({
      where: { driverName },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });

    return sales.map((sale) => this.toSaleRecord(sale));
  }

  async createSale(input: CreateSaleInput, actorUsername?: string): Promise<SaleRecord> {
    if (input.clientGeneratedId) {
      const existing = await this.prisma.sale.findUnique({
        where: { clientGeneratedId: input.clientGeneratedId },
        include: { items: true },
      });

      if (existing) {
        return this.toSaleRecord(existing);
      }
    }

    const priceTable = await this.pricesService.getPriceTable();
    const { customerType, customerName, customerId, truckId } =
      await this.resolveCustomerAndTruck(input);
    const total = calculateSaleTotal(customerType, input.items, priceTable);
    const resolvedDriverName = actorUsername?.trim() || input.driverName.trim();
    const resolvedTruckCode = input.truckCode?.trim() || null;

    const sale = await this.prisma.sale.create({
      data: {
        clientGeneratedId: input.clientGeneratedId ?? null,
        driverName: resolvedDriverName,
        truckCode: resolvedTruckCode,
        customerName,
        customerType: customerType as PrismaCustomerType,
        paymentMethod: input.paymentMethod as PrismaPaymentMethod,
        note: input.note?.trim() || null,
        total,
        customerId,
        truckId,
        items: {
          create: input.items.map((item) => ({
            productCode: item.productCode as PrismaProductCode,
            quantity: item.quantity,
          })),
        },
        audits: {
          create: {
            action: PrismaSaleAuditAction.created,
            reason: 'Venta creada',
          },
        },
      },
      include: { items: true },
    });

    return this.toSaleRecord(sale);
  }

  async updateSale(id: string, input: UpdateSaleInput, actorUsername?: string): Promise<SaleRecord> {
    const existing = await this.prisma.sale.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!existing) {
      throw new NotFoundException('Sale not found');
    }

    if (existing.status === 'canceled') {
      throw new ConflictException('Canceled sales cannot be edited');
    }

    const priceTable = await this.pricesService.getPriceTable();
    const { customerType, customerName, customerId, truckId } =
      await this.resolveCustomerAndTruck(input);
    const total = calculateSaleTotal(customerType, input.items, priceTable);
    const resolvedDriverName = actorUsername?.trim() || input.driverName.trim();
    const resolvedTruckCode = input.truckCode?.trim() || null;

    const beforeSnapshot = {
      driverName: existing.driverName,
      truckCode: existing.truckCode,
      customerName: existing.customerName,
      customerType: existing.customerType,
      paymentMethod: existing.paymentMethod,
      total: existing.total,
      note: existing.note,
      items: existing.items.map((item) => ({
        productCode: item.productCode,
        quantity: item.quantity,
      })),
    };

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.saleItem.deleteMany({ where: { saleId: id } });

      const sale = await tx.sale.update({
        where: { id },
        data: {
          driverName: resolvedDriverName,
          truckCode: resolvedTruckCode,
          customerName,
          customerType: customerType as PrismaCustomerType,
          paymentMethod: input.paymentMethod as PrismaPaymentMethod,
          note: input.note?.trim() || null,
          total,
          customerId,
          truckId,
          items: {
            create: input.items.map((item) => ({
              productCode: item.productCode as PrismaProductCode,
              quantity: item.quantity,
            })),
          },
        },
        include: { items: true },
      });

      await tx.saleAudit.create({
        data: {
          saleId: id,
          action: PrismaSaleAuditAction.edited,
          reason: input.reason.trim(),
          before: beforeSnapshot,
          after: {
            driverName: sale.driverName,
            truckCode: sale.truckCode,
            customerName: sale.customerName,
            customerType: sale.customerType,
            paymentMethod: sale.paymentMethod,
            total: sale.total,
            note: sale.note,
            items: sale.items.map((item) => ({
              productCode: item.productCode,
              quantity: item.quantity,
            })),
          },
        },
      });

      return sale;
    });

    return this.toSaleRecord(updated);
  }

  async cancelSale(id: string, input: CancelSaleInput): Promise<SaleRecord> {
    const existing = await this.prisma.sale.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!existing) {
      throw new NotFoundException('Sale not found');
    }

    if (existing.status === 'canceled') {
      throw new ConflictException('Sale is already canceled');
    }

    const sale = await this.prisma.sale.update({
      where: { id },
      data: {
        status: 'canceled',
        canceledAt: new Date(),
        cancelReason: input.reason.trim(),
        audits: {
          create: {
            action: PrismaSaleAuditAction.canceled,
            reason: input.reason.trim(),
            before: {
              status: existing.status,
            },
            after: {
              status: 'canceled',
            },
          },
        },
      },
      include: { items: true },
    });

    return this.toSaleRecord(sale);
  }

  async listSaleAudits(saleId: string): Promise<SaleAuditRecord[]> {
    const sale = await this.prisma.sale.findUnique({ where: { id: saleId } });

    if (!sale) {
      throw new NotFoundException('Sale not found');
    }

    const audits = await this.prisma.saleAudit.findMany({
      where: { saleId },
      orderBy: { createdAt: 'desc' },
    });

    return audits.map((audit) => this.toAuditRecord(audit));
  }

  private toSaleRecord(sale: Sale & { items: SaleItem[] }): SaleRecord {
    return {
      id: sale.id,
      createdAt: sale.createdAt.toISOString(),
      status: sale.status,
      canceledAt: sale.canceledAt?.toISOString(),
      cancelReason: sale.cancelReason ?? undefined,
      driverName: sale.driverName,
      truckCode: sale.truckCode ?? undefined,
      total: sale.total,
      customerName: sale.customerName,
      customerType: sale.customerType,
      paymentMethod: sale.paymentMethod,
      note: sale.note ?? undefined,
      items: sale.items.map((item) => ({
        productCode: item.productCode,
        quantity: item.quantity,
      })),
    };
  }

  private toAuditRecord(audit: SaleAudit): SaleAuditRecord {
    return {
      id: audit.id,
      saleId: audit.saleId,
      action: audit.action,
      reason: audit.reason,
      createdAt: audit.createdAt.toISOString(),
    };
  }
}
