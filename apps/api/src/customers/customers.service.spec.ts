import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { CreateCustomerInput, UpdateCustomerInput } from '@distribuidor/shared';
import { CustomerCategoriesService } from '../customer-categories/customer-categories.service';
import { PrismaService } from '../prisma/prisma.service';
import { CustomersService } from './customers.service';

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

function buildCustomerRow(overrides: Partial<CustomerRow> = {}): CustomerRow {
  return {
    id: 'customer-1',
    name: 'Kiosco Sur',
    customerType: 'final',
    zoneId: 'zone-sur',
    zoneRef: { id: 'zone-sur', name: 'Sur' },
    address: null,
    latitude: null,
    longitude: null,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function buildZoneRow(overrides: Partial<ZoneRow> = {}): ZoneRow {
  return { id: 'zone-sur', name: 'Sur', isActive: true, ...overrides };
}

describe('CustomersService', () => {
  let service: CustomersService;
  let categoriesService: { assertCategoryAssignable: jest.Mock };
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
    zone: {
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
      zone: {
        findUnique: jest.fn().mockResolvedValue(buildZoneRow()),
      },
    };

    categoriesService = {
      assertCategoryAssignable: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: PrismaService, useValue: prisma },
        { provide: CustomerCategoriesService, useValue: categoriesService },
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
        zoneId: 'zone-sur',
      };
      prisma.customer.create.mockResolvedValue(buildCustomerRow({ name: input.name }));

      const result = await service.createCustomer(input);

      expect(prisma.customer.create).toHaveBeenCalledWith({
        data: {
          name: 'Kiosco Sur',
          customerType: 'final',
          zoneId: 'zone-sur',
          address: undefined,
          latitude: undefined,
          longitude: undefined,
          isActive: true,
        },
        include: { zoneRef: { select: { id: true, name: true } } },
      });
      expect(result.isActive).toBe(true);
    });

    it('creates a second customer with the same name in a different zone (both exist)', async () => {
      const inputSur: CreateCustomerInput = {
        name: 'Kiosco Central',
        customerType: 'final',
        zoneId: 'zone-sur',
      };
      const inputNorte: CreateCustomerInput = {
        name: 'Kiosco Central',
        customerType: 'comercio',
        zoneId: 'zone-norte',
      };
      prisma.customer.create
        .mockResolvedValueOnce(
          buildCustomerRow({ id: 'customer-sur', name: 'Kiosco Central' }),
        )
        .mockResolvedValueOnce(
          buildCustomerRow({
            id: 'customer-norte',
            name: 'Kiosco Central',
            customerType: 'comercio',
            zoneId: 'zone-norte',
            zoneRef: { id: 'zone-norte', name: 'Norte' },
          }),
        );

      const sur = await service.createCustomer(inputSur);
      prisma.customer.findMany.mockResolvedValue([
        buildCustomerRow({ id: 'customer-sur', name: 'Kiosco Central' }),
      ]);
      prisma.zone.findUnique.mockResolvedValue(
        buildZoneRow({ id: 'zone-norte', name: 'Norte' }),
      );
      const norte = await service.createCustomer(inputNorte);

      expect(prisma.customer.create).toHaveBeenCalledTimes(2);
      expect(sur.id).toBe('customer-sur');
      expect(norte.id).toBe('customer-norte');
      expect(sur.name).toBe(norte.name);
      expect(sur.zoneId).not.toBe(norte.zoneId);
    });
  });

  describe('createCustomer — zone assignment', () => {
    const input: CreateCustomerInput = {
      name: 'Kiosco Sur',
      customerType: 'final',
      zoneId: 'zone-sur',
    };

    beforeEach(() => {
      prisma.customer.create.mockResolvedValue(buildCustomerRow());
    });

    // La columna sombra ya no existe: se persiste el id y nada mas. El nombre
    // para mostrar sale siempre de la relacion.
    it('persists only the zone id, never a copy of its name', async () => {
      prisma.zone.findUnique.mockResolvedValue(
        buildZoneRow({ id: 'zone-sur', name: 'Sur' }),
      );

      await service.createCustomer(input);

      const [[args]] = prisma.customer.create.mock.calls;
      expect(args.data.zoneId).toBe('zone-sur');
      expect(args.data).not.toHaveProperty('zone');
    });

    it('rejects an unknown zoneId with a BadRequestException naming it', async () => {
      prisma.zone.findUnique.mockResolvedValue(null);

      await expect(service.createCustomer(input)).rejects.toThrow(BadRequestException);
      await expect(service.createCustomer(input)).rejects.toThrow(/zone-sur/);
      expect(prisma.customer.create).not.toHaveBeenCalled();
    });

    // A diferencia del codigo de producto, que tiene que seguir aceptandose
    // aunque este de baja porque viaja dentro de ventas ya encoladas, la zona
    // se elige de una lista viva: asignar una dada de baja es un error.
    it('rejects a deactivated zone', async () => {
      prisma.zone.findUnique.mockResolvedValue(buildZoneRow({ isActive: false }));

      await expect(service.createCustomer(input)).rejects.toThrow(BadRequestException);
      expect(prisma.customer.create).not.toHaveBeenCalled();
    });

    it('creates a customer with no zone at all', async () => {
      prisma.customer.create.mockResolvedValue(
        buildCustomerRow({ zoneId: null, zoneRef: null }),
      );

      const result = await service.createCustomer({
        name: 'Kiosco Sur',
        customerType: 'final',
      });

      expect(prisma.zone.findUnique).not.toHaveBeenCalled();
      expect(result.zoneId).toBeUndefined();
      expect(result.zone).toBeUndefined();
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
        include: { zoneRef: { select: { id: true, name: true } } },
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
      zoneId: 'zone-sur',
    };

    it('rejects a same-name, same-zone customer with a ConflictException', async () => {
      prisma.customer.findMany.mockResolvedValue([
        buildCustomerRow({ id: 'existing-1', name: 'Don Jose', zoneId: 'zone-sur' }),
      ]);

      await expect(service.createCustomer(input)).rejects.toThrow(ConflictException);
      expect(prisma.customer.create).not.toHaveBeenCalled();
    });

    it('carries the conflicting customer in the exception, so the caller can offer it', async () => {
      prisma.customer.findMany.mockResolvedValue([
        buildCustomerRow({ id: 'existing-1', name: 'Don Jose', zoneId: 'zone-sur' }),
      ]);

      await expect(service.createCustomer(input)).rejects.toMatchObject({
        response: { customer: expect.objectContaining({ id: 'existing-1' }) },
      });
    });

    it('treats accents and casing as the same name', async () => {
      prisma.customer.findMany.mockResolvedValue([
        buildCustomerRow({ id: 'existing-1', name: '  DON JOSÉ ', zoneId: 'zone-sur' }),
      ]);

      await expect(service.createCustomer(input)).rejects.toThrow(ConflictException);
    });

    // La zona ahora es una FK, no una cadena: dos filas distintas son dos
    // zonas distintas aunque se llamen parecido, y cuatro grafias de "Centro"
    // ya no pueden forkear una zona a espaldas de esta comparacion.
    it('lets the same name live in a different zone', async () => {
      prisma.customer.findMany.mockResolvedValue([
        buildCustomerRow({ id: 'existing-1', name: 'Don Jose', zoneId: 'zone-norte' }),
      ]);
      prisma.customer.create.mockResolvedValue(buildCustomerRow({ id: 'customer-new' }));

      const result = await service.createCustomer(input);

      expect(result.id).toBe('customer-new');
    });

    // Sin zona es su propio grupo, no un comodin: exactamente la misma
    // semantica que tenia la comparacion por texto.
    it('treats a missing zone as its own bucket', async () => {
      prisma.customer.findMany.mockResolvedValue([
        buildCustomerRow({
          id: 'existing-1',
          name: 'Don Jose',
          zoneId: null,
          zoneRef: null,
        }),
      ]);

      await expect(
        service.createCustomer({ name: 'Don Jose', customerType: 'final' }),
      ).rejects.toThrow(ConflictException);
    });

    it('does not collide a zoneless customer with a zoned one of the same name', async () => {
      prisma.customer.findMany.mockResolvedValue([
        buildCustomerRow({ id: 'existing-1', name: 'Don Jose', zoneId: 'zone-sur' }),
      ]);
      prisma.customer.create.mockResolvedValue(buildCustomerRow({ id: 'customer-new' }));

      const result = await service.createCustomer({
        name: 'Don Jose',
        customerType: 'final',
      });

      expect(result.id).toBe('customer-new');
    });

    it('creates anyway when the caller explicitly allows the duplicate', async () => {
      prisma.customer.findMany.mockResolvedValue([
        buildCustomerRow({ id: 'existing-1', name: 'Don Jose', zoneId: 'zone-sur' }),
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
        include: { zoneRef: { select: { id: true, name: true } } },
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
        include: { zoneRef: { select: { id: true, name: true } } },
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
        include: { zoneRef: { select: { id: true, name: true } } },
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
        include: { zoneRef: { select: { id: true, name: true } } },
      });
      expect(result.address).toBeUndefined();
    });

    it('leaves untouched fields out of the update payload entirely', async () => {
      prisma.customer.findUnique.mockResolvedValue(buildCustomerRow());
      prisma.customer.update.mockResolvedValue(buildCustomerRow({ address: 'X' }));

      await service.updateCustomer('customer-1', { address: 'X' });

      const [[call]] = prisma.customer.update.mock.calls;
      expect(Object.keys(call.data)).toEqual(['address']);
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

  describe('customerType assignment', () => {
    beforeEach(() => {
      prisma.customer.create.mockResolvedValue(buildCustomerRow());
      prisma.customer.findUnique.mockResolvedValue(buildCustomerRow());
      prisma.customer.update.mockResolvedValue(buildCustomerRow());
    });

    it('validates the customerType against the categories table on create', async () => {
      await service.createCustomer({ name: 'Kiosco Sur', customerType: 'mayorista' });

      expect(categoriesService.assertCategoryAssignable).toHaveBeenCalledWith(
        'mayorista',
      );
    });

    it('does not write anything when the category is unknown or retired', async () => {
      categoriesService.assertCategoryAssignable.mockRejectedValue(
        new BadRequestException('Unknown customerType: fantasma'),
      );

      await expect(
        service.createCustomer({ name: 'Kiosco Sur', customerType: 'fantasma' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.customer.create).not.toHaveBeenCalled();
    });

    it('validates the customerType before writing on update', async () => {
      await service.updateCustomer('customer-1', { customerType: 'mayorista' });

      expect(categoriesService.assertCategoryAssignable).toHaveBeenCalledWith(
        'mayorista',
      );
    });

    it('does not update anything when the category is unknown or retired', async () => {
      categoriesService.assertCategoryAssignable.mockRejectedValue(
        new BadRequestException('Customer category retirada is not active'),
      );

      await expect(
        service.updateCustomer('customer-1', { customerType: 'retirada' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });

    // Un patch que no toca la categoria no la revalida: el cliente puede tener
    // una categoria dada de baja, y editarle la direccion no puede fallar por
    // eso.
    it('leaves an untouched customerType alone, even if it is retired', async () => {
      await service.updateCustomer('customer-1', { address: 'Calle 1' });

      expect(categoriesService.assertCategoryAssignable).not.toHaveBeenCalled();
      expect(prisma.customer.update).toHaveBeenCalled();
    });
  });

  describe('updateCustomer — zone assignment', () => {
    beforeEach(() => {
      prisma.customer.findUnique.mockResolvedValue(buildCustomerRow());
      prisma.customer.update.mockResolvedValue(buildCustomerRow());
    });

    it('moves the customer to another zone by id, without copying its name', async () => {
      prisma.zone.findUnique.mockResolvedValue(
        buildZoneRow({ id: 'zone-norte', name: 'Norte' }),
      );

      await service.updateCustomer('customer-1', { zoneId: 'zone-norte' });

      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'customer-1' },
        data: { zoneId: 'zone-norte' },
        include: { zoneRef: { select: { id: true, name: true } } },
      });
    });

    it('clears the zone with an explicit null', async () => {
      await service.updateCustomer('customer-1', { zoneId: null });

      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'customer-1' },
        data: { zoneId: null },
        include: { zoneRef: { select: { id: true, name: true } } },
      });
      expect(prisma.zone.findUnique).not.toHaveBeenCalled();
    });

    it('rejects an unknown zoneId before writing anything', async () => {
      prisma.zone.findUnique.mockResolvedValue(null);

      await expect(
        service.updateCustomer('customer-1', { zoneId: 'zone-ghost' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });

    it('rejects a deactivated zone before writing anything', async () => {
      prisma.zone.findUnique.mockResolvedValue(buildZoneRow({ isActive: false }));

      await expect(
        service.updateCustomer('customer-1', { zoneId: 'zone-sur' }),
      ).rejects.toThrow(BadRequestException);
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
        include: { zoneRef: { select: { id: true, name: true } } },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('customer-active');
    });

    // `zone` sigue siendo el nombre para mostrar, asi que todo lo que solo lo
    // renderiza -- el aviso de duplicado del chofer, por ejemplo -- no cambia.
    it('returns the zone id and the zone display name side by side', async () => {
      prisma.customer.findMany.mockResolvedValue([buildCustomerRow()]);

      const [record] = await service.listCustomers();

      expect(record.zoneId).toBe('zone-sur');
      expect(record.zone).toBe('Sur');
    });

    it('reads the display name from the relation, the only place it lives now', async () => {
      prisma.customer.findMany.mockResolvedValue([
        buildCustomerRow({
          zoneId: 'zone-sur',
          zoneRef: { id: 'zone-sur', name: 'Sur' },
        }),
      ]);

      const [record] = await service.listCustomers();

      expect(record.zone).toBe('Sur');
    });

    it('leaves both zone fields undefined for a customer with no zone', async () => {
      prisma.customer.findMany.mockResolvedValue([
        buildCustomerRow({ zoneId: null, zoneRef: null }),
      ]);

      const [record] = await service.listCustomers();

      expect(record.zoneId).toBeUndefined();
      expect(record.zone).toBeUndefined();
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
