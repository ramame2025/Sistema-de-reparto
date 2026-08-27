import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  calculateSaleTotal,
  type CancelSaleInput,
  type CreateSaleInput,
  type CustomerType,
  type RecordEmptyVisitInput,
  type SaleAuditRecord,
  type SaleKind,
  type SaleRecord,
  type UpdateSaleInput,
} from '@distribuidor/shared';
import {
  CustomerType as PrismaCustomerType,
  PaymentMethod as PrismaPaymentMethod,
  SaleAuditAction as PrismaSaleAuditAction,
  SaleKind as PrismaSaleKind,
  type SaleAudit,
  type Sale,
  type SaleItem,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PricesService } from '../prices/prices.service';
import { ProductsService } from '../products/products.service';

type ResolvedSaleLinks = {
  customerType: CustomerType;
  customerName: string;
  customerId: string | null;
  truckId: string | null;
};

/**
 * Subset of fields `resolveCustomerAndTruck` actually needs. `CreateSaleInput`
 * and `RecordEmptyVisitInput` both satisfy this shape, so the same
 * customerId/truckId existence+active lookup logic serves `createSale` (via
 * `CreateSaleInput`/`UpdateSaleInput`) and `recordEmptyVisit` (via
 * `RecordEmptyVisitInput`) without duplicating it.
 */
type SaleIdentityLookupInput = Pick<
  CreateSaleInput,
  'customerType' | 'customerName' | 'customerId' | 'truckId'
>;

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricesService: PricesService,
    private readonly productsService: ProductsService,
  ) {}

  private async resolveCustomerAndTruck(
    input: SaleIdentityLookupInput,
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

    // `packages/shared` valida la forma del codigo pero no puede saber cuales
    // existen: el catalogo lo define el admin en runtime. La pertenencia se
    // verifica aca, antes de escribir, para que un codigo desconocido salga
    // como un 400 legible y no como un error de FK de Prisma.
    await this.productsService.assertProductCodesExist(
      input.items.map((item) => item.productCode),
    );

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
        paymentProofRef: input.paymentProofRef?.trim() || null,
        containerReturned: input.containerReturned ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        items: {
          create: input.items.map((item) => ({
            productCode: item.productCode,
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

  /**
   * Records a churn visit: container returned, nothing delivered. Isolated
   * from `createSale` on purpose (Design decision #1) -- its own
   * `prisma.sale.create` call, forces `kind: 'churn'`, `paymentMethod: null`,
   * `total: 0`, `containerReturned: true`, and zero `SaleItem` rows
   * server-side regardless of anything a caller might smuggle in, since
   * `RecordEmptyVisitInput` never carries `items`/`paymentMethod` in the
   * first place.
   */
  async recordEmptyVisit(
    input: RecordEmptyVisitInput,
    actorUsername?: string,
  ): Promise<SaleRecord> {
    if (input.clientGeneratedId) {
      const existing = await this.prisma.sale.findUnique({
        where: { clientGeneratedId: input.clientGeneratedId },
        include: { items: true },
      });

      if (existing) {
        return this.toSaleRecord(existing);
      }
    }

    const { customerType, customerName, customerId, truckId } =
      await this.resolveCustomerAndTruck(input);
    const resolvedDriverName = actorUsername?.trim() || input.driverName.trim();
    const resolvedTruckCode = input.truckCode?.trim() || null;

    const sale = await this.prisma.sale.create({
      data: {
        clientGeneratedId: input.clientGeneratedId ?? null,
        driverName: resolvedDriverName,
        truckCode: resolvedTruckCode,
        customerName,
        customerType: customerType as PrismaCustomerType,
        paymentMethod: null,
        note: input.note?.trim() || null,
        total: 0,
        kind: PrismaSaleKind.churn,
        containerReturned: true,
        customerId,
        truckId,
        items: {
          create: [],
        },
        audits: {
          create: {
            action: PrismaSaleAuditAction.created,
            reason: 'Visita sin venta',
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

    // Kind-consistency guard (Design decision #3): the row's *stored* kind is
    // the only source of truth. `input.kind` is a validation hint the pure
    // shared validator used to decide which checks to run -- here it is only
    // ever compared against the real, persisted kind, never trusted alone.
    // Mismatch -> reject before touching anything else.
    const existingKind = existing.kind as SaleKind;
    const requestedKind: SaleKind = input.kind ?? 'sale';

    if (existingKind !== requestedKind) {
      throw new ConflictException('Sale kind does not match the stored record');
    }

    const isChurn = existingKind === 'churn';

    if (!isChurn) {
      await this.productsService.assertProductCodesExist(
        input.items.map((item) => item.productCode),
      );
    }

    const priceTable = await this.pricesService.getPriceTable();
    const { customerType, customerName, customerId, truckId } =
      await this.resolveCustomerAndTruck(input);
    // A churn row never has items/paymentMethod, on create or on edit
    // (Design decision #2/#5): forced here too, regardless of whatever the
    // edit payload does or doesn't carry, mirroring `recordEmptyVisit`.
    const total = isChurn ? 0 : calculateSaleTotal(customerType, input.items, priceTable);
    const resolvedPaymentMethod = isChurn ? null : (input.paymentMethod as PrismaPaymentMethod);
    const resolvedItems = isChurn
      ? []
      : input.items.map((item) => ({
          productCode: item.productCode,
          quantity: item.quantity,
        }));
    const resolvedDriverName = actorUsername?.trim() || input.driverName.trim();
    const resolvedTruckCode = input.truckCode?.trim() || null;
    // A churn row never has a payment, so it never has a payment proof either
    // (Design decision #6): forced null here too, same as paymentMethod/items,
    // regardless of whatever the edit payload does or doesn't carry.
    const resolvedPaymentProofRef = isChurn ? null : (input.paymentProofRef?.trim() || null);
    // A churn row always means "container returned" (recordEmptyVisit forces
    // this true at creation) -- an edit never changes that fact, same
    // forcing logic as the fields above. A normal sale keeps whatever the
    // edit payload says (undefined -> null, "not asked").
    const resolvedContainerReturned = isChurn ? true : (input.containerReturned ?? null);
    // Immutability by design (Open Question 3 / Design decision #6): unlike
    // every other editable field above, latitude/longitude are NEVER derived
    // from `input` here, unconditionally -- not just for churn rows. They are
    // structurally present on `UpdateSaleInput` (inherited via composition
    // over `CreateSaleInput`, same as `kind`), but a GPS coordinate for a past
    // instant has no honest real-world referent once that instant has passed;
    // it can only be fabricated on edit. The row's stored value from creation
    // time is the only source of truth, forever. Do NOT "fix" this to read
    // input.latitude/input.longitude "for consistency" with paymentProofRef --
    // that would silently break this guarantee.
    const resolvedLatitude = existing.latitude;
    const resolvedLongitude = existing.longitude;

    const beforeSnapshot = {
      driverName: existing.driverName,
      truckCode: existing.truckCode,
      customerName: existing.customerName,
      customerType: existing.customerType,
      paymentMethod: existing.paymentMethod,
      total: existing.total,
      note: existing.note,
      paymentProofRef: existing.paymentProofRef,
      containerReturned: existing.containerReturned,
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
          paymentMethod: resolvedPaymentMethod,
          note: input.note?.trim() || null,
          total,
          customerId,
          truckId,
          paymentProofRef: resolvedPaymentProofRef,
          containerReturned: resolvedContainerReturned,
          latitude: resolvedLatitude,
          longitude: resolvedLongitude,
          items: {
            create: resolvedItems,
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
            paymentProofRef: sale.paymentProofRef,
            containerReturned: sale.containerReturned,
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
      // `paymentMethod` is nullable at both the DB and `SaleRecord` type
      // level: `null` for a churn row (`kind === 'churn'`, written by
      // `recordEmptyVisit`), a real `PaymentMethod` for every normal sale.
      // Direct assignment, no cast needed -- both sides agree on the type.
      paymentMethod: sale.paymentMethod,
      note: sale.note ?? undefined,
      kind: sale.kind,
      containerReturned: sale.containerReturned ?? undefined,
      paymentProofRef: sale.paymentProofRef ?? undefined,
      latitude: sale.latitude ?? undefined,
      longitude: sale.longitude ?? undefined,
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
