import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { CreateCustomerInput } from '@distribuidor/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CustomersService } from './customers.service';

type CustomerRow = {
  id: string;
  name: string;
  customerType: string;
  zone: string | null;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function buildCustomerRow(overrides: Partial<CustomerRow> = {}): CustomerRow {
  return {
    id: 'customer-1',
    name: 'Kiosco Sur',
    customerType: 'final',
    zone: 'Sur',
    latitude: null,
    longitude: null,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('CustomersService', () => {
  let service: CustomersService;
  let prisma: {
    customer: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    sale: {
      findUnique: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      customer: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      sale: {
        findUnique: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(CustomersService);
  });

  describe('createCustomer', () => {
    it('creates a customer with isActive set to true', async () => {
      const input: CreateCustomerInput = {
        name: 'Kiosco Sur',
        customerType: 'final',
        zone: 'Sur',
      };
      const created = buildCustomerRow({ name: input.name, zone: 'Sur' });
      prisma.customer.create.mockResolvedValue(created);

      const result = await service.createCustomer(input);

      expect(prisma.customer.create).toHaveBeenCalledWith({
        data: {
          name: 'Kiosco Sur',
          customerType: 'final',
          zone: 'Sur',
          latitude: undefined,
          longitude: undefined,
          isActive: true,
        },
      });
      expect(result.isActive).toBe(true);
    });

    it('creates a second customer with the same name in a different zone (both exist)', async () => {
      const inputSur: CreateCustomerInput = {
        name: 'Kiosco Central',
        customerType: 'final',
        zone: 'Sur',
      };
      const inputNorte: CreateCustomerInput = {
        name: 'Kiosco Central',
        customerType: 'comercio',
        zone: 'Norte',
      };
      prisma.customer.create
        .mockResolvedValueOnce(
          buildCustomerRow({ id: 'customer-sur', name: 'Kiosco Central', zone: 'Sur' }),
        )
        .mockResolvedValueOnce(
          buildCustomerRow({
            id: 'customer-norte',
            name: 'Kiosco Central',
            zone: 'Norte',
            customerType: 'comercio',
          }),
        );

      const sur = await service.createCustomer(inputSur);
      const norte = await service.createCustomer(inputNorte);

      expect(prisma.customer.create).toHaveBeenCalledTimes(2);
      expect(sur.id).toBe('customer-sur');
      expect(norte.id).toBe('customer-norte');
      expect(sur.name).toBe(norte.name);
      expect(sur.zone).not.toBe(norte.zone);
    });
  });

  describe('listCustomers', () => {
    it('excludes inactive customers from the result', async () => {
      prisma.customer.findMany.mockResolvedValue([
        buildCustomerRow({ id: 'customer-active', isActive: true }),
      ]);

      const result = await service.listCustomers();

      expect(prisma.customer.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('customer-active');
    });
  });

  describe('deactivateCustomer', () => {
    it('flips isActive to false without deleting the record', async () => {
      prisma.customer.findUnique.mockResolvedValue(buildCustomerRow());
      prisma.customer.update.mockResolvedValue(
        buildCustomerRow({ isActive: false }),
      );

      await service.deactivateCustomer('customer-1');

      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'customer-1' },
        data: { isActive: false },
      });
    });

    it('never touches the Sale table, leaving existing Sale FK references intact', async () => {
      prisma.customer.findUnique.mockResolvedValue(buildCustomerRow());
      prisma.customer.update.mockResolvedValue(
        buildCustomerRow({ isActive: false }),
      );

      await service.deactivateCustomer('customer-1');

      expect(prisma.sale.findUnique).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the customer does not exist', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);

      await expect(service.deactivateCustomer('missing')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });
  });
});
