import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { CreateCustomerInput, UpdateCustomerInput } from '@distribuidor/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CustomersService } from './customers.service';

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

function buildCustomerRow(overrides: Partial<CustomerRow> = {}): CustomerRow {
  return {
    id: 'customer-1',
    name: 'Kiosco Sur',
    customerType: 'final',
    zone: 'Sur',
    address: null,
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
    // createCustomer scans the active directory for a same-name duplicate
    // before inserting; default to "directory is empty".
    prisma.customer.findMany.mockResolvedValue([]);
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
          address: undefined,
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
      prisma.customer.findMany.mockResolvedValue([
        buildCustomerRow({ id: 'customer-sur', name: 'Kiosco Central', zone: 'Sur' }),
      ]);
      const norte = await service.createCustomer(inputNorte);

      expect(prisma.customer.create).toHaveBeenCalledTimes(2);
      expect(sur.id).toBe('customer-sur');
      expect(norte.id).toBe('customer-norte');
      expect(sur.name).toBe(norte.name);
      expect(sur.zone).not.toBe(norte.zone);
    });
  });

  describe('createCustomer — address', () => {
    it('persists the street address when provided', async () => {
      const input: CreateCustomerInput = {
        name: 'Kiosco Sur',
        customerType: 'final',
        address: 'Av. Mitre 1234',
      };
      prisma.customer.create.mockResolvedValue(
        buildCustomerRow({ address: 'Av. Mitre 1234' }),
      );

      const result = await service.createCustomer(input);

      expect(prisma.customer.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ address: 'Av. Mitre 1234' }),
      });
      expect(result.address).toBe('Av. Mitre 1234');
    });

    it('maps a null address to undefined on the record', async () => {
      prisma.customer.create.mockResolvedValue(buildCustomerRow({ address: null }));

      const result = await service.createCustomer({
        name: 'Kiosco Sur',
        customerType: 'final',
      });

      expect(result.address).toBeUndefined();
    });
  });

  describe('createCustomer — duplicate detection', () => {
    const input: CreateCustomerInput = {
      name: 'Don Jose',
      customerType: 'final',
      zone: 'Sur',
    };

    it('rejects a same-name, same-zone customer with a ConflictException', async () => {
      prisma.customer.findMany.mockResolvedValue([
        buildCustomerRow({ id: 'existing-1', name: 'Don Jose', zone: 'Sur' }),
      ]);

      await expect(service.createCustomer(input)).rejects.toThrow(ConflictException);
      expect(prisma.customer.create).not.toHaveBeenCalled();
    });

    it('carries the conflicting customer in the exception, so the caller can offer it', async () => {
      prisma.customer.findMany.mockResolvedValue([
        buildCustomerRow({ id: 'existing-1', name: 'Don Jose', zone: 'Sur' }),
      ]);

      await expect(service.createCustomer(input)).rejects.toMatchObject({
        response: { customer: expect.objectContaining({ id: 'existing-1' }) },
      });
    });

    it('treats accents and casing as the same name', async () => {
      prisma.customer.findMany.mockResolvedValue([
        buildCustomerRow({ id: 'existing-1', name: '  DON JOSÉ ', zone: 'Sur' }),
      ]);

      await expect(service.createCustomer(input)).rejects.toThrow(ConflictException);
    });

    it('creates anyway when the caller explicitly allows the duplicate', async () => {
      prisma.customer.findMany.mockResolvedValue([
        buildCustomerRow({ id: 'existing-1', name: 'Don Jose', zone: 'Sur' }),
      ]);
      prisma.customer.create.mockResolvedValue(buildCustomerRow({ id: 'customer-new' }));

      const result = await service.createCustomer(input, { allowDuplicate: true });

      expect(result.id).toBe('customer-new');
      expect(prisma.customer.create).toHaveBeenCalled();
    });

    it('ignores inactive customers when looking for a duplicate', async () => {
      prisma.customer.create.mockResolvedValue(buildCustomerRow({ id: 'customer-new' }));

      await service.createCustomer(input);

      expect(prisma.customer.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
      });
      expect(prisma.customer.create).toHaveBeenCalled();
    });
  });

  describe('updateCustomer', () => {
    it('patches only the fields the caller named', async () => {
      prisma.customer.findUnique.mockResolvedValue(buildCustomerRow());
      prisma.customer.update.mockResolvedValue(
        buildCustomerRow({ name: 'Kiosco Norte' }),
      );

      const patch: UpdateCustomerInput = { name: 'Kiosco Norte' };
      const result = await service.updateCustomer('customer-1', patch);

      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'customer-1' },
        data: { name: 'Kiosco Norte' },
      });
      expect(result.name).toBe('Kiosco Norte');
    });

    it('moves the pin when both coordinates are supplied', async () => {
      prisma.customer.findUnique.mockResolvedValue(buildCustomerRow());
      prisma.customer.update.mockResolvedValue(
        buildCustomerRow({ latitude: -34.6, longitude: -58.4 }),
      );

      await service.updateCustomer('customer-1', {
        latitude: -34.6,
        longitude: -58.4,
      });

      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'customer-1' },
        data: { latitude: -34.6, longitude: -58.4 },
      });
    });

    it('clears the address with an explicit null', async () => {
      prisma.customer.findUnique.mockResolvedValue(
        buildCustomerRow({ address: 'Av. Mitre 1234' }),
      );
      prisma.customer.update.mockResolvedValue(buildCustomerRow({ address: null }));

      const result = await service.updateCustomer('customer-1', { address: null });

      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'customer-1' },
        data: { address: null },
      });
      expect(result.address).toBeUndefined();
    });

    it('leaves untouched fields out of the update payload entirely', async () => {
      prisma.customer.findUnique.mockResolvedValue(buildCustomerRow());
      prisma.customer.update.mockResolvedValue(buildCustomerRow({ zone: 'Norte' }));

      await service.updateCustomer('customer-1', { zone: 'Norte' });

      const [[call]] = prisma.customer.update.mock.calls;
      expect(Object.keys(call.data)).toEqual(['zone']);
    });

    it('never touches the Sale table, so linked sales keep their customerId', async () => {
      prisma.customer.findUnique.mockResolvedValue(buildCustomerRow());
      prisma.customer.update.mockResolvedValue(buildCustomerRow({ name: 'Corregido' }));

      await service.updateCustomer('customer-1', { name: 'Corregido' });

      expect(prisma.sale.findUnique).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the customer does not exist', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);

      await expect(
        service.updateCustomer('missing', { name: 'Kiosco Norte' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an already-deactivated customer', async () => {
      prisma.customer.findUnique.mockResolvedValue(
        buildCustomerRow({ isActive: false }),
      );

      await expect(
        service.updateCustomer('customer-1', { name: 'Kiosco Norte' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.customer.update).not.toHaveBeenCalled();
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
