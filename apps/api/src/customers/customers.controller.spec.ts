import { BadRequestException } from '@nestjs/common';
import { ROLES_KEY } from '../auth/roles.decorator';
import { CustomersController } from './customers.controller';
import type { CustomersService } from './customers.service';

describe('CustomersController role metadata', () => {
  it('allows admin and chofer to list customers (GET /customers)', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, CustomersController.prototype.listCustomers);
    expect(roles).toEqual(['admin', 'chofer']);
  });

  it('allows admin and chofer to create a customer (POST /customers)', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, CustomersController.prototype.createCustomer);
    expect(roles).toEqual(['admin', 'chofer']);
  });

  it('leaves deactivateCustomer (DELETE /customers/:id) admin-only via the class-level default', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, CustomersController);
    expect(roles).toEqual(['admin']);
  });

  // Correcting the directory is office work; the field app gets no edit
  // surface, so updateCustomer inherits the admin-only class default.
  it('leaves updateCustomer (PATCH /customers/:id) admin-only via the class-level default', () => {
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      CustomersController.prototype.updateCustomer,
    );
    expect(roles).toBeUndefined();
  });
});

describe('CustomersController behaviour', () => {
  let controller: CustomersController;
  let service: {
    listCustomers: jest.Mock;
    createCustomer: jest.Mock;
    updateCustomer: jest.Mock;
    deactivateCustomer: jest.Mock;
  };

  beforeEach(() => {
    service = {
      listCustomers: jest.fn(),
      createCustomer: jest.fn(),
      updateCustomer: jest.fn(),
      deactivateCustomer: jest.fn(),
    };
    controller = new CustomersController(service as unknown as CustomersService);
  });

  describe('createCustomer', () => {
    const valid = { name: 'Kiosco Sur', customerType: 'final' as const };

    it('rejects an invalid payload before reaching the service', async () => {
      await expect(
        controller.createCustomer({ ...valid, name: 'K' }, undefined),
      ).rejects.toThrow(BadRequestException);
      expect(service.createCustomer).not.toHaveBeenCalled();
    });

    it('defaults to refusing duplicates', async () => {
      await controller.createCustomer(valid, undefined);
      expect(service.createCustomer).toHaveBeenCalledWith(valid, {
        allowDuplicate: false,
      });
    });

    it('forwards allowDuplicate when the caller opts in', async () => {
      await controller.createCustomer(valid, 'true');
      expect(service.createCustomer).toHaveBeenCalledWith(valid, {
        allowDuplicate: true,
      });
    });

    it('treats any value other than "true" as not allowing duplicates', async () => {
      await controller.createCustomer(valid, 'maybe');
      expect(service.createCustomer).toHaveBeenCalledWith(valid, {
        allowDuplicate: false,
      });
    });
  });

  describe('updateCustomer', () => {
    it('rejects an empty patch before reaching the service', async () => {
      await expect(controller.updateCustomer('customer-1', {})).rejects.toThrow(
        BadRequestException,
      );
      expect(service.updateCustomer).not.toHaveBeenCalled();
    });

    it('rejects a half-set coordinate pair before reaching the service', async () => {
      await expect(
        controller.updateCustomer('customer-1', { latitude: -34.6 }),
      ).rejects.toThrow(BadRequestException);
      expect(service.updateCustomer).not.toHaveBeenCalled();
    });

    it('forwards a valid patch to the service', async () => {
      await controller.updateCustomer('customer-1', { name: 'Kiosco Norte' });
      expect(service.updateCustomer).toHaveBeenCalledWith('customer-1', {
        name: 'Kiosco Norte',
      });
    });
  });
});
