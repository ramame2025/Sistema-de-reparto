import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  deriveSaleKind,
  priceSaleItems,
  resolveOccurredAt,
  type CancelSaleInput,
  type CreateSaleInput,
  type CustomerType,
  type PriceTable,
  type PricedSaleItem,
  type RecordEmptyVisitInput,
  type SaleAuditRecord,
  type SaleItemInput,
  type SaleKind,
  type SaleRecord,
  type SaleReturnItemInput,
  type UpdateSaleInput,
} from '@distribuidor/shared';
import {
  SaleAuditAction as PrismaSaleAuditAction,
  SaleKind as PrismaSaleKind,
  ReturnReason as PrismaReturnReason,
  type SaleAudit,
  type Sale,
  type SaleItem,
  type SaleReturnItem,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PricesService } from '../prices/prices.service';
import { CustomerCategoriesService } from '../customer-categories/customer-categories.service';
import { PaymentMethodsService } from '../payment-methods/payment-methods.service';
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
    private readonly categoriesService: CustomerCategoriesService,
    private readonly paymentMethodsService: PaymentMethodsService,
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

    // `packages/shared` valida la forma de la categoria pero no puede saber
    // cuales existen: las define el admin en runtime. La pertenencia se
    // verifica aca, antes de escribir, igual que la del producto.
    //
    // Existencia, NO vigencia: `assertCategoryCodesExist` acepta a proposito
    // una categoria dada de baja, porque ese string llega dentro de una venta
    // que el telefono encolo antes de que el admin la retirara. Rechazarla
    // perderia una venta real.
    await this.categoriesService.assertCategoryCodesExist([customerType]);

    return { customerType, customerName, customerId, truckId };
  }

  /**
   * Valoriza las lineas, o rechaza la operacion nombrando los pares que no
   * tienen precio.
   *
   * Es un 400 y no un 500: que a un tipo de cliente le falte el precio de un
   * producto es una configuracion incompleta del admin -- un estado legitimo
   * desde que el tipo de cliente se crea antes de cargarle los precios -- y no
   * una falla del servidor. El par culpable va en el mensaje, mismo criterio
   * que `assertProductCodesExist`: quien lee un log o un banner tiene que
   * saber QUE falta cargar sin abrir el JSON.
   *
   * La alternativa vieja era congelar `unitPrice: 0`, que regalaba la
   * mercaderia sin que nadie se enterara.
   */
  private priceItemsOrReject(
    customerType: CustomerType,
    items: SaleItemInput[],
    priceTable: PriceTable,
  ): { items: PricedSaleItem[]; total: number } {
    const priced = priceSaleItems(customerType, items, priceTable);

    if (!priced.ok) {
      const pairs = priced.missing.map(
        (pair) =>
          `No price for customerType=${pair.customerType} productCode=${pair.productCode}`,
      );

      throw new BadRequestException({
        message: pairs.join(', '),
        errors: pairs,
      });
    }

    return { items: priced.items, total: priced.total };
  }

  /**
   * Lo que vuelve de la calle, listo para grabar: los vacios con motivo
   * `empty` y las falladas con motivo `faulty`, en ese orden.
   *
   * Va a `SaleReturnItem` y NUNCA a `SaleItem`. El stock del camion suma toda
   * linea de `SaleItem` sin filtrar, asi que una unidad que ENTRA anotada ahi
   * se contaria como mercaderia que SALIO.
   */
  private buildReturnRows(
    returnedItems: SaleReturnItemInput[],
    swappedItems: SaleReturnItemInput[],
  ): { productCode: string; quantity: number; reason: PrismaReturnReason }[] {
    return [
      ...returnedItems.map((item) => ({
        productCode: item.productCode,
        quantity: item.quantity,
        reason: PrismaReturnReason.empty,
      })),
      ...swappedItems.map((item) => ({
        productCode: item.productCode,
        quantity: item.quantity,
        reason: PrismaReturnReason.faulty,
      })),
    ];
  }

  /**
   * Las unidades de REEMPLAZO de un cambio por falla. Salen del camion, asi
   * que son `SaleItem` y tienen que descontar; entran con `unitPrice: 0` y
   * sin consultar la tabla de precios, porque un cambio no cobra y un precio
   * faltante no puede bloquearlo (D4). El cero de aca es el importe real de
   * una linea que no cobro nada, no un agujero disimulado.
   *
   * Es el MISMO numero que la fallada que vuelve: un solo campo del payload
   * alimenta los dos lados, asi que el 1 a 1 no se puede romper.
   */
  private buildReplacementItems(
    swappedItems: SaleReturnItemInput[],
  ): PricedSaleItem[] {
    return swappedItems.map((item) => ({
      productCode: item.productCode,
      quantity: item.quantity,
      unitPrice: 0,
    }));
  }

  async listSales(): Promise<SaleRecord[]> {
    const sales = await this.prisma.sale.findMany({
      include: { items: true, returnItems: true },
      orderBy: { createdAt: 'desc' },
    });

    return sales.map((sale) => this.toSaleRecord(sale));
  }

  async listSalesByDriver(driverName: string): Promise<SaleRecord[]> {
    const sales = await this.prisma.sale.findMany({
      where: { driverName },
      include: { items: true, returnItems: true },
      orderBy: { createdAt: 'desc' },
    });

    return sales.map((sale) => this.toSaleRecord(sale));
  }

  async createSale(input: CreateSaleInput, actorUsername?: string): Promise<SaleRecord> {
    if (input.clientGeneratedId) {
      const existing = await this.prisma.sale.findUnique({
        where: { clientGeneratedId: input.clientGeneratedId },
        include: { items: true, returnItems: true },
      });

      if (existing) {
        return this.toSaleRecord(existing);
      }
    }

    // El `kind` no se elige: se deriva de lo que trajo la visita, con la misma
    // funcion pura que usa la pantalla del chofer. Un payload que diga otra
    // cosa no tiene forma de imponerla -- aca abajo se fuerza todo lo que
    // corresponda.
    const returnedItems = input.returnedItems ?? [];
    const swappedItems = input.swappedItems ?? [];
    const kind = deriveSaleKind(input);
    const isSale = kind === 'sale';

    // `packages/shared` valida la forma del codigo pero no puede saber cuales
    // existen: el catalogo lo define el admin en runtime. La pertenencia se
    // verifica aca, antes de escribir, para que un codigo desconocido salga
    // como un 400 legible y no como un error de FK de Prisma.
    //
    // Las TRES listas, no solo la vendida: un vacio o una fallada de un
    // producto inexistente reventaria igual contra la foreign key.
    await this.productsService.assertProductCodesExist([
      ...input.items.map((item) => item.productCode),
      ...returnedItems.map((item) => item.productCode),
      ...swappedItems.map((item) => item.productCode),
    ]);

    // Mismo contrato que el producto y la categoria: la forma la valido
    // `packages/shared`, la EXISTENCIA se verifica aca. Y existencia, no
    // vigencia -- un medio dado de baja despues de que el telefono encolara
    // la venta se acepta igual, porque esa plata ya se cobro.
    //
    // Solo cuando hubo cobro: una fila que no vendio nada no tiene medio de
    // pago que verificar, y el que venga en el payload se ignora.
    if (isSale) {
      await this.paymentMethodsService.assertPaymentMethodCodesExist([
        input.paymentMethod,
      ]);
    }

    // Cuando paso la venta, no cuando llego: una venta sin senal se sincroniza
    // mas tarde, y tiene que tarifarse con los precios de su propio momento.
    const occurredAt = resolveOccurredAt(input.occurredAt, new Date());

    const priceTable = await this.pricesService.getPriceTableAt(occurredAt);
    const { customerType, customerName, customerId, truckId } =
      await this.resolveCustomerAndTruck(input);

    // El precio unitario se congela en cada linea, y el total se deriva de
    // esas lineas. Asi total e items no pueden discrepar nunca: `priceSaleItems`
    // devuelve los dos juntos justamente para que no puedan calcularse aparte.
    //
    // Se tarifa SOLO lo vendido. Una visita que no vendio nada no toca la
    // tarifacion en absoluto, asi que un precio faltante no puede bloquear un
    // cambio ni una devolucion (D4).
    const { items: soldItems, total: soldTotal } =
      input.items.length > 0
        ? this.priceItemsOrReject(customerType, input.items, priceTable)
        : { items: [] as PricedSaleItem[], total: 0 };
    const pricedItems = [...soldItems, ...this.buildReplacementItems(swappedItems)];
    const returnRows = this.buildReturnRows(returnedItems, swappedItems);
    // Forzado server-side, sin importar lo que traiga el payload: si la visita
    // no vendio nada, no cobro nada. Un swap con `paymentMethod: 'efectivo'`
    // adentro no graba un cobro, se lo ignora.
    const total = isSale ? soldTotal : 0;
    const resolvedDriverName = actorUsername?.trim() || input.driverName.trim();
    const resolvedTruckCode = input.truckCode?.trim() || null;

    const sale = await this.prisma.sale.create({
      data: {
        clientGeneratedId: input.clientGeneratedId ?? null,
        occurredAt,
        driverName: resolvedDriverName,
        truckCode: resolvedTruckCode,
        customerName,
        customerType,
        paymentMethod: isSale ? input.paymentMethod : null,
        note: input.note?.trim() || null,
        total,
        kind: kind as PrismaSaleKind,
        customerId,
        truckId,
        // Sin cobro no hay comprobante de cobro que guardar.
        paymentProofRef: isSale ? input.paymentProofRef?.trim() || null : null,
        // El booleano historico se queda y ahora se deriva de lo que
        // efectivamente volvio (D9). No hay backfill posible para las filas
        // viejas: dicen que algo volvio y nunca se guardo cuanto.
        //
        // Se deriva SOLO de `returnedItems`, no de todo lo que vuelve: el
        // booleano significa "volvio un envase vacio y no le dimos nada a
        // cambio". En un cambio por falla tambien vuelve una unidad, pero se
        // entrego un reemplazo, asi que no es lo mismo y marcarlo mentiria.
        containerReturned:
          input.containerReturned ?? (returnedItems.length > 0 ? true : null),
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        items: {
          create: pricedItems,
        },
        returnItems: {
          create: returnRows,
        },
        audits: {
          create: {
            action: PrismaSaleAuditAction.created,
            reason: 'Venta creada',
          },
        },
      },
      include: { items: true, returnItems: true },
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
        include: { items: true, returnItems: true },
      });

      if (existing) {
        return this.toSaleRecord(existing);
      }
    }

    // Una visita sin venta tambien ocurre en la calle y tambien se encola sin
    // senal, asi que merece la misma fecha real que una venta. No se tarifa
    // -- total 0, sin items -- pero si se cuenta en el dia correcto.
    const occurredAt = resolveOccurredAt(input.occurredAt, new Date());

    const { customerType, customerName, customerId, truckId } =
      await this.resolveCustomerAndTruck(input);
    const resolvedDriverName = actorUsername?.trim() || input.driverName.trim();
    const resolvedTruckCode = input.truckCode?.trim() || null;

    const sale = await this.prisma.sale.create({
      data: {
        clientGeneratedId: input.clientGeneratedId ?? null,
        occurredAt,
        driverName: resolvedDriverName,
        truckCode: resolvedTruckCode,
        customerName,
        customerType,
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
        // El atajo ahora tambien puede decir CUANTOS vacios volvieron y de
        // que producto. Su ausencia deja la fila como estaba, que es lo que
        // traen las visitas ya encoladas en los telefonos.
        returnItems: {
          create: this.buildReturnRows(input.returnedItems ?? [], []),
        },
        audits: {
          create: {
            action: PrismaSaleAuditAction.created,
            reason: 'Visita sin venta',
          },
        },
      },
      include: { items: true, returnItems: true },
    });

    return this.toSaleRecord(sale);
  }

  async updateSale(id: string, input: UpdateSaleInput, actorUsername?: string): Promise<SaleRecord> {
    const existing = await this.prisma.sale.findUnique({
      where: { id },
      include: { items: true, returnItems: true },
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
    const isSwap = existingKind === 'swap';
    // Las dos clases que no cobraron. Se las trata igual en todo lo que tenga
    // que ver con plata; la diferencia entre ellas es que un swap SI tiene
    // items -- la unidad de reemplazo que salio del camion -- y por eso puede
    // editar cantidades, que un churn no.
    const isMoneyless = isChurn || isSwap;

    /**
     * Que hacer con lo que VUELVE, decidido por PRESENCIA en el payload.
     *
     * La edicion reescribia los `SaleItem` y dejaba los `SaleReturnItem`
     * intactos: en un cambio por falla eso movia el reemplazo y dejaba la
     * fallada en su numero viejo, rompiendo por la puerta de atras el 1 a 1
     * que la pantalla no puede romper (D6b).
     *
     * Reescribirlos SIEMPRE no era la salida: un cliente viejo -- y hay
     * telefonos con ventas encoladas -- no manda estas listas, y borraria en
     * silencio lo que volvio en cualquier venta que edite. Asi que lo que el
     * payload no nombra, no se toca.
     *
     * Las falladas tienen una fuente de respaldo y no por simetria: en una
     * fila de cambio los `items` SON los reemplazos, o sea el mismo numero que
     * las falladas. Derivar los dos lados de una sola lista -- venga como
     * `swappedItems` o como `items` -- es lo que hace que el 1 a 1 se sostenga
     * incluso frente a un cliente que no conoce las listas nuevas. No hay
     * borrado en silencio: se reescribe con el numero que ya define la fila.
     *
     * Los vacios no tienen respaldo posible: nada en un payload viejo los
     * nombra, y por eso sobreviven intactos a cualquier edicion que no los
     * traiga.
     */
    const emptySource = input.returnedItems;
    const faultySource = input.swappedItems ?? (isSwap ? input.items : undefined);

    if (!isChurn) {
      await this.productsService.assertProductCodesExist([
        ...input.items.map((item) => item.productCode),
        ...(emptySource ?? []).map((item) => item.productCode),
        ...(input.swappedItems ?? []).map((item) => item.productCode),
      ]);
    }

    if (!isMoneyless) {
      // Una fila que no cobro no tiene medio de pago que verificar.
      await this.paymentMethodsService.assertPaymentMethodCodesExist([
        input.paymentMethod,
      ]);
    }

    // Con la fecha ORIGINAL de la venta, nunca con la de hoy: corregir una
    // cantidad de una venta de marzo no puede moverle el precio a agosto.
    const priceTable = await this.pricesService.getPriceTableAt(existing.occurredAt);
    const { customerType, customerName, customerId, truckId } =
      await this.resolveCustomerAndTruck(input);
    // A churn row never has items/paymentMethod, on create or on edit
    // (Design decision #2/#5): forced here too, regardless of whatever the
    // edit payload does or doesn't carry, mirroring `recordEmptyVisit`.
    //
    // Un churn no tiene items, asi que no hay nada que cotizar: la falta de
    // precios nunca puede bloquear su edicion.
    //
    // Un swap tampoco se tarifa: sus lineas son reemplazos que no cobran, asi
    // que entran con `unitPrice: 0` y un precio faltante nunca puede bloquear
    // la edicion de un cambio, igual que no bloquea su creacion (D4).
    const { items: resolvedItems, total } = isChurn
      ? { items: [] as PricedSaleItem[], total: 0 }
      : isSwap
        ? // Los reemplazos salen de la MISMA lista que las falladas, para que
          // los dos lados no puedan quedar en numeros distintos.
          { items: this.buildReplacementItems(faultySource ?? []), total: 0 }
        : // En una venta, `items` es lo VENDIDO y el reemplazo se deriva de
          // `swappedItems`, igual que en la creacion: una visita mixta vendio
          // y ademas cambio, y la linea del cambio entra con precio cero sin
          // sumar al total. Que `items` signifique lo mismo en los dos caminos
          // es lo que evita que una edicion cobre un reemplazo o lo pierda.
          (() => {
            const sold = this.priceItemsOrReject(customerType, input.items, priceTable);
            return {
              items: [
                ...sold.items,
                ...this.buildReplacementItems(input.swappedItems ?? []),
              ],
              total: sold.total,
            };
          })();
    const resolvedPaymentMethod = isMoneyless ? null : input.paymentMethod;
    const resolvedDriverName = actorUsername?.trim() || input.driverName.trim();
    const resolvedTruckCode = input.truckCode?.trim() || null;
    // A churn row never has a payment, so it never has a payment proof either
    // (Design decision #6): forced null here too, same as paymentMethod/items,
    // regardless of whatever the edit payload does or doesn't carry.
    const resolvedPaymentProofRef = isMoneyless ? null : (input.paymentProofRef?.trim() || null);
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

    // Solo los motivos que el payload nombra: lo que no menciona, sobrevive.
    const rewrittenReturnRows = [
      ...(emptySource ? this.buildReturnRows(emptySource, []) : []),
      ...(faultySource ? this.buildReturnRows([], faultySource) : []),
    ];
    const rewritesReturns = emptySource !== undefined || faultySource !== undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.saleItem.deleteMany({ where: { saleId: id } });

      if (emptySource !== undefined) {
        await tx.saleReturnItem.deleteMany({
          where: { saleId: id, reason: PrismaReturnReason.empty },
        });
      }

      if (faultySource !== undefined) {
        await tx.saleReturnItem.deleteMany({
          where: { saleId: id, reason: PrismaReturnReason.faulty },
        });
      }

      const sale = await tx.sale.update({
        where: { id },
        data: {
          driverName: resolvedDriverName,
          truckCode: resolvedTruckCode,
          customerName,
          customerType,
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
          // Ausente, no vacio, cuando el payload no nombra ningun motivo: un
          // `create: []` seria indistinguible de "borralo todo".
          ...(rewritesReturns ? { returnItems: { create: rewrittenReturnRows } } : {}),
        },
        include: { items: true, returnItems: true },
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
      include: { items: true, returnItems: true },
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
      include: { items: true, returnItems: true },
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

  private toSaleRecord(
    sale: Sale & { items: SaleItem[]; returnItems: SaleReturnItem[] },
  ): SaleRecord {
    return {
      id: sale.id,
      createdAt: sale.createdAt.toISOString(),
      occurredAt: sale.occurredAt.toISOString(),
      status: sale.status,
      canceledAt: sale.canceledAt?.toISOString(),
      cancelReason: sale.cancelReason ?? undefined,
      driverName: sale.driverName,
      truckCode: sale.truckCode ?? undefined,
      total: sale.total,
      customerName: sale.customerName,
      customerType: sale.customerType,
      // Sin esto un consumidor no puede editar una venta sin desengancharla
      // de su cliente: `updateSale` reescribe el vinculo con lo que reciba, y
      // `resolveCustomerAndTruck` lee la ausencia del campo como "desenganchar".
      customerId: sale.customerId ?? undefined,
      // `paymentMethod` is nullable at both the DB and `SaleRecord` type
      // level: `null` for every row that did not charge (`kind === 'churn'`
      // or `kind === 'swap'`), a real `PaymentMethod` for every normal sale.
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
        unitPrice: item.unitPrice,
      })),
      // Lo que volvio, por producto y por motivo. Siempre presente en la
      // respuesta, aunque este vacio: quien la lee no tiene que distinguir
      // "no volvio nada" de "esta API no lo dice".
      returnItems: sale.returnItems.map((item) => ({
        productCode: item.productCode,
        quantity: item.quantity,
        reason: item.reason,
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
