import { BadRequestException } from '@nestjs/common';
import { ROLES_KEY } from '../auth/roles.decorator';
import { ZonesController } from './zones.controller';
import type { ZonesService } from './zones.service';

describe('ZonesController role metadata', () => {
  it('lets both roles read the zone list (GET /zones)', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, ZonesController.prototype.listZones);
    expect(roles).toEqual(['admin', 'chofer']);
  });

  // Quien define el mapa de reparto es el admin: las escrituras heredan el
  // default admin-only de la clase.
  it('leaves createZone admin-only via the class-level default', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, ZonesController.prototype.createZone),
    ).toBeUndefined();
  });

  it('leaves updateZone admin-only via the class-level default', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, ZonesController.prototype.updateZone),
    ).toBeUndefined();
  });

  it('keeps the class default at admin', () => {
    expect(Reflect.getMetadata(ROLES_KEY, ZonesController)).toEqual(['admin']);
  });
});

describe('ZonesController behaviour', () => {
  let controller: ZonesController;
  let service: {
    listZones: jest.Mock;
    createZone: jest.Mock;
    updateZone: jest.Mock;
  };

  beforeEach(() => {
    service = {
      listZones: jest.fn().mockResolvedValue([]),
      createZone: jest.fn().mockResolvedValue({}),
      updateZone: jest.fn().mockResolvedValue({}),
    };
    controller = new ZonesController(service as unknown as ZonesService);
  });

  describe('listZones', () => {
    it('hides inactive zones from a driver, whatever the query says', async () => {
      await controller.listZones('true', { user: { role: 'chofer' } } as never);

      expect(service.listZones).toHaveBeenCalledWith({ includeInactive: false });
    });

    it('lets an admin ask for the full list', async () => {
      await controller.listZones('true', { user: { role: 'admin' } } as never);

      expect(service.listZones).toHaveBeenCalledWith({ includeInactive: true });
    });

    it('returns only active zones to an admin by default', async () => {
      await controller.listZones(undefined, { user: { role: 'admin' } } as never);

      expect(service.listZones).toHaveBeenCalledWith({ includeInactive: false });
    });
  });

  describe('createZone', () => {
    const valid = { code: 'CENTRO', name: 'Centro' };

    it('forwards a valid payload', async () => {
      await controller.createZone(valid);
      expect(service.createZone).toHaveBeenCalledWith(valid);
    });

    it('rejects a malformed code before reaching the service', async () => {
      await expect(controller.createZone({ ...valid, code: 'centro' })).rejects.toThrow(
        BadRequestException,
      );
      expect(service.createZone).not.toHaveBeenCalled();
    });
  });

  describe('updateZone', () => {
    it('rejects an empty patch before reaching the service', async () => {
      await expect(controller.updateZone('z1', {})).rejects.toThrow(
        BadRequestException,
      );
      expect(service.updateZone).not.toHaveBeenCalled();
    });

    it('forwards a valid patch', async () => {
      await controller.updateZone('z1', { isActive: false });
      expect(service.updateZone).toHaveBeenCalledWith('z1', { isActive: false });
    });
  });
});
