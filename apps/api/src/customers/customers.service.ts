import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  normalizeCustomerName,
  type CreateCustomerInput,
  type CustomerRecord,
  type CustomerType,
  type UpdateCustomerInput,
} from '@distribuidor/shared';
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
  zone: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/** Two customers share a zone when their zones normalize alike; a missing
 *  zone is its own bucket rather than a wildcard. */
function normalizeZone(zone: string | null | undefined): string {
  return (zone ?? '').trim().toLowerCase();
}

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async listCustomers(): Promise<CustomerRecord[]> {
    const customers = await this.prisma.customer.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    return customers.map((customer) => this.toRecord(customer));
  }

  async createCustomer(
    input: CreateCustomerInput,
    options: CreateCustomerOptions = {},
  ): Promise<CustomerRecord> {
    if (!options.allowDuplicate) {
      const duplicate = await this.findActiveDuplicate(input.name, input.zone);
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
        zone: input.zone,
        address: input.address,
        latitude: input.latitude,
        longitude: input.longitude,
        isActive: true,
      },
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
    if (input.customerType !== undefined) data.customerType = input.customerType;
    if (input.zone !== undefined) data.zone = input.zone;
    if (input.address !== undefined) data.address = input.address;
    if (input.latitude !== undefined) data.latitude = input.latitude;
    if (input.longitude !== undefined) data.longitude = input.longitude;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    const updated = await this.prisma.customer.update({ where: { id }, data });

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
   * Accent folding rules this out as a database-side comparison, so the
   * active directory is scanned in memory. That is sound at the directory's
   * current size — the same size assumption `listCustomers` already makes by
   * returning every active customer unpaginated.
   */
  private async findActiveDuplicate(
    name: string,
    zone: string | null | undefined,
  ): Promise<CustomerRow | null> {
    const candidates: CustomerRow[] = await this.prisma.customer.findMany({
      where: { isActive: true },
    });
    const targetName = normalizeCustomerName(name);
    const targetZone = normalizeZone(zone);

    return (
      candidates.find(
        (candidate) =>
          normalizeCustomerName(candidate.name) === targetName &&
          normalizeZone(candidate.zone) === targetZone,
      ) ?? null
    );
  }

  private toRecord(customer: CustomerRow): CustomerRecord {
    return {
      id: customer.id,
      name: customer.name,
      customerType: customer.customerType as CustomerType,
      zone: customer.zone ?? undefined,
      address: customer.address ?? undefined,
      latitude: customer.latitude ?? undefined,
      longitude: customer.longitude ?? undefined,
      isActive: customer.isActive,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    };
  }
}
