import { Injectable, NotFoundException } from '@nestjs/common';
import {
  type CreateCustomerInput,
  type CustomerRecord,
  type CustomerType,
} from '@distribuidor/shared';
import { PrismaService } from '../prisma/prisma.service';

export type { CustomerRecord };

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

  async createCustomer(input: CreateCustomerInput): Promise<CustomerRecord> {
    const customer = await this.prisma.customer.create({
      data: {
        name: input.name.trim(),
        customerType: input.customerType as CustomerType,
        zone: input.zone,
        latitude: input.latitude,
        longitude: input.longitude,
        isActive: true,
      },
    });

    return this.toRecord(customer);
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

  private toRecord(customer: {
    id: string;
    name: string;
    customerType: string;
    zone: string | null;
    latitude: number | null;
    longitude: number | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): CustomerRecord {
    return {
      id: customer.id,
      name: customer.name,
      customerType: customer.customerType as CustomerType,
      zone: customer.zone ?? undefined,
      latitude: customer.latitude ?? undefined,
      longitude: customer.longitude ?? undefined,
      isActive: customer.isActive,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    };
  }
}
