import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { CreateZoneInput } from '@distribuidor/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ZonesService } from './zones.service';

type ZoneRow = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

function buildZoneRow(overrides: Partial<ZoneRow> = {}): ZoneRow {
  return {
    id: 'zone-1',
    code: 'CENTRO',
    name: 'Centro',
    isActive: true,
    sortOrder: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('ZonesService', () => {
  let service: ZonesService;
  let prisma: {
    zone: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      zone: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [ZonesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(ZonesService);
  });

  describe('listZones', () => {
    it('returns only active zones by default, ordered for display', async () => {
      prisma.zone.findMany.mockResolvedValue([buildZoneRow()]);

      const result = await service.listZones();

      expect(prisma.zone.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
      expect(result[0].code).toBe('CENTRO');
    });

    it('includes inactive zones when asked', async () => {
      prisma.zone.findMany.mockResolvedValue([]);

      await service.listZones({ includeInactive: true });

      expect(prisma.zone.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
    });
  });

  describe('createZone', () => {
    const input: CreateZoneInput = { code: 'CENTRO', name: 'Centro' };

    beforeEach(() => {
      prisma.zone.findUnique.mockResolvedValue(null);
      prisma.zone.create.mockResolvedValue(buildZoneRow());
    });

    it('creates the zone as active', async () => {
      await service.createZone(input);

      expect(prisma.zone.create).toHaveBeenCalledWith({
        data: { code: 'CENTRO', name: 'Centro', sortOrder: 0, isActive: true },
      });
    });

    it('normalizes the code by trimming it', async () => {
      await service.createZone({ ...input, code: '  CENTRO  ' });

      expect(prisma.zone.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ code: 'CENTRO' }),
      });
    });

    it('keeps the sortOrder the caller asked for', async () => {
      await service.createZone({ ...input, sortOrder: 7 });

      expect(prisma.zone.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ sortOrder: 7 }),
      });
    });

    it('rejects a duplicate code with a ConflictException', async () => {
      prisma.zone.findUnique.mockResolvedValue(buildZoneRow());

      await expect(service.createZone(input)).rejects.toThrow(ConflictException);
      expect(prisma.zone.create).not.toHaveBeenCalled();
    });

    // Una zona dada de baja sigue ocupando su codigo: los clientes que la
    // referencian no dejan de hacerlo, asi que reusarlo mezclaria dos zonas
    // distintas bajo la misma clave.
    it('treats a deactivated zone as still occupying its code', async () => {
      prisma.zone.findUnique.mockResolvedValue(buildZoneRow({ isActive: false }));

      await expect(service.createZone(input)).rejects.toThrow(ConflictException);
    });
  });

  describe('updateZone', () => {
    it('patches only the fields named', async () => {
      prisma.zone.findUnique.mockResolvedValue(buildZoneRow());
      prisma.zone.update.mockResolvedValue(buildZoneRow({ name: 'Centro Norte' }));

      await service.updateZone('zone-1', { name: 'Centro Norte' });

      expect(prisma.zone.update).toHaveBeenCalledWith({
        where: { id: 'zone-1' },
        data: { name: 'Centro Norte' },
      });
    });

    it('deactivates without deleting, so the customers keep their zone', async () => {
      prisma.zone.findUnique.mockResolvedValue(buildZoneRow());
      prisma.zone.update.mockResolvedValue(buildZoneRow({ isActive: false }));

      const result = await service.updateZone('zone-1', { isActive: false });

      expect(result.isActive).toBe(false);
    });

    it('reorders a zone', async () => {
      prisma.zone.findUnique.mockResolvedValue(buildZoneRow());
      prisma.zone.update.mockResolvedValue(buildZoneRow({ sortOrder: 3 }));

      const result = await service.updateZone('zone-1', { sortOrder: 3 });

      expect(prisma.zone.update).toHaveBeenCalledWith({
        where: { id: 'zone-1' },
        data: { sortOrder: 3 },
      });
      expect(result.sortOrder).toBe(3);
    });

    it('throws NotFoundException for an unknown id', async () => {
      prisma.zone.findUnique.mockResolvedValue(null);

      await expect(service.updateZone('missing', { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.zone.update).not.toHaveBeenCalled();
    });
  });
});
