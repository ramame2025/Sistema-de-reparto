import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  normalizeCustomerName,
  type CreateCustomerInput,
  type CustomerRecord,
  type CustomerType,
  type UpdateCustomerInput,
} from '@distribuidor/shared';
import { CustomerCategoriesService } from '../customer-categories/customer-categories.service';
import { PrismaService } from '../prisma/prisma.service';

export type { CustomerRecord };

export type CreateCustomerOptions = {
  /**
   * Skip duplicate detection. The caller has seen the conflicting customer
   * and decided this really is a different one.
   */
  allowDuplicate?: boolean;
};

type CustomerRow = {
  id: string;
  name: string;
  customerType: string;
  zoneId: string | null;
  zoneRef: { id: string; name: string } | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type ZoneRow = {
  id: string;
  name: string;
  isActive: boolean;
};

/**
 * El nombre para mostrar de la zona sale de la relacion. La columna sombra
 * `Customer.zone` sigue existiendo, pero ya no es de donde se lee.
 */
const ZONE_INCLUDE = { zoneRef: { select: { id: true, name: true } } } as const;

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categoriesService: CustomerCategoriesService,
  ) {}

  async listCustomers(): Promise<CustomerRecord[]> {
    const customers = await this.prisma.customer.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: ZONE_INCLUDE,
    });

    return customers.map((customer) => this.toRecord(customer));
  }

  async createCustomer(
    input: CreateCustomerInput,
    options: CreateCustomerOptions = {},
  ): Promise<CustomerRecord> {
    // La categoria se valida ANTES de escribir nada. Se exige VIGENTE, no solo
    // existente: darle de alta un cliente es una eleccion contra una lista
    // viva -- el panel del admin o el alta rapida del chofer, que es online --
    // asi que una categoria dada de baja ahi es un error, no una venta vieja
    // sincronizando. Es el criterio opuesto al de una venta entrante, que si
    // acepta una categoria retirada (`assertCategoryCodesExist`).
    await this.categoriesService.assertCategoryAssignable(input.customerType);

    // La zona se valida ANTES de escribir nada. No se guarda su nombre: lo
    // unico que se persiste es el id, y el nombre para mostrar se resuelve
    // siempre desde la relacion.
    await this.resolveZone(input.zoneId);

    if (!options.allowDuplicate) {
      const duplicate = await this.findActiveDuplicate(input.name, input.zoneId);
      if (duplicate) {
        // Reported, never silently blocked: the caller decides whether this
        // is the same customer (pick the existing one) or a genuinely new
        // one that happens to share a name (retry allowing the duplicate).
        throw new ConflictException({
          message: 'A customer with this name already exists in this zone',
          customer: this.toRecord(duplicate),
        });
      }
    }

    const customer = await this.prisma.customer.create({
      data: {
        name: input.name.trim(),
        customerType: input.customerType as CustomerType,
        zoneId: input.zoneId,
        address: input.address,
        latitude: input.latitude,
        longitude: input.longitude,
        isActive: true,
      },
      include: ZONE_INCLUDE,
    });

    return this.toRecord(customer);
  }

  async updateCustomer(
    id: string,
    input: UpdateCustomerInput,
  ): Promise<CustomerRecord> {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer || !customer.isActive) {
      throw new NotFoundException('Customer not found');
    }

    // Only the named fields reach Prisma: an absent key must stay absent, or
    // it would overwrite a stored value with undefined.
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.customerType !== undefined) {
      // Solo si el patch la toca: un cliente puede tener una categoria dada de
      // baja, y editarle la direccion no puede fallar por eso.
      await this.categoriesService.assertCategoryAssignable(input.customerType);
      data.customerType = input.customerType;
    }
    if (input.zoneId !== undefined) {
      // La zona se valida ANTES de escribir nada, asi que un id inexistente o
      // dado de baja no deja al cliente a medio actualizar.
      await this.resolveZone(input.zoneId);
      data.zoneId = input.zoneId;
    }
    if (input.address !== undefined) data.address = input.address;
    if (input.latitude !== undefined) data.latitude = input.latitude;
    if (input.longitude !== undefined) data.longitude = input.longitude;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    const updated = await this.prisma.customer.update({
      where: { id },
      data,
      include: ZONE_INCLUDE,
    });

    return this.toRecord(updated);
  }

  async deactivateCustomer(id: string): Promise<void> {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    await this.prisma.customer.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * Resuelve la zona que el payload nombra. Devuelve null cuando no nombra
   * ninguna -- no tener zona es legitimo -- y rechaza el resto.
   *
   * A diferencia de `ProductsService.assertProductCodesExist`, que acepta un
   * producto dado de baja porque su codigo viaja dentro de ventas ya
   * encoladas en los telefonos, la zona se elige de una lista viva: asignar
   * una dada de baja no es una venta vieja sincronizando, es un error.
   */
  private async resolveZone(
    zoneId: string | null | undefined,
  ): Promise<ZoneRow | null> {
    if (zoneId === undefined || zoneId === null) {
      return null;
    }

    const zone: ZoneRow | null = await this.prisma.zone.findUnique({
      where: { id: zoneId },
      select: { id: true, name: true, isActive: true },
    });

    // El id culpable va en el mensaje, no solo en `errors`: quien lee un log o
    // un banner de error tiene que saber CUAL fallo sin abrir el JSON.
    if (!zone) {
      throw new BadRequestException({
        message: `Unknown zoneId: ${zoneId}`,
        errors: [`zoneId ${zoneId} does not exist`],
      });
    }

    if (!zone.isActive) {
      throw new BadRequestException({
        message: `Zone ${zoneId} is not active`,
        errors: [`zoneId ${zoneId} is not active`],
      });
    }

    return zone;
  }

  /**
   * Accent folding rules this out as a database-side comparison, so the
   * active directory is scanned in memory. That is sound at the directory's
   * current size — the same size assumption `listCustomers` already makes by
   * returning every active customer unpaginated.
   *
   * La zona ya no se compara por texto sino por FK, y eso es estrictamente
   * mas estricto: antes cuatro grafias de "Centro" que no normalizaran igual
   * forkeaban la zona en silencio, y con la fila esa puerta no existe. Sin
   * zona sigue siendo su propio grupo, no un comodin.
   */
  private async findActiveDuplicate(
    name: string,
    zoneId: string | null | undefined,
  ): Promise<CustomerRow | null> {
    const candidates: CustomerRow[] = await this.prisma.customer.findMany({
      where: { isActive: true },
      include: ZONE_INCLUDE,
    });
    const targetName = normalizeCustomerName(name);
    const targetZoneId = zoneId ?? null;

    return (
      candidates.find(
        (candidate) =>
          normalizeCustomerName(candidate.name) === targetName &&
          (candidate.zoneId ?? null) === targetZoneId,
      ) ?? null
    );
  }

  private toRecord(customer: CustomerRow): CustomerRecord {
    return {
      id: customer.id,
      name: customer.name,
      customerType: customer.customerType as CustomerType,
      zoneId: customer.zoneId ?? undefined,
      zone: customer.zoneRef?.name ?? undefined,
      address: customer.address ?? undefined,
      latitude: customer.latitude ?? undefined,
      longitude: customer.longitude ?? undefined,
      isActive: customer.isActive,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    };
  }
}
