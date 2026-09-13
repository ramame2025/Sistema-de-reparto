import { ROLES_KEY } from '../auth/roles.decorator';
import { PaymentMethodsController } from './payment-methods.controller';
import type { PaymentMethodsService } from './payment-methods.service';

describe('PaymentMethodsController role metadata', () => {
  it('lets both roles read the payment method list (GET /payment-methods)', () => {
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      PaymentMethodsController.prototype.listPaymentMethods,
    );
    expect(roles).toEqual(['admin', 'chofer']);
  });

  it('keeps the class default at admin', () => {
    expect(Reflect.getMetadata(ROLES_KEY, PaymentMethodsController)).toEqual([
      'admin',
    ]);
  });

  /**
   * En esta fase la tabla es de solo lectura a proposito (D3 del plan): una
   * mala configuracion deja a los choferes sin poder cobrar. Este test falla
   * si alguien agrega una escritura sin pasar por esa decision.
   */
  it('exposes no write endpoints at all', () => {
    const methods = Object.getOwnPropertyNames(
      PaymentMethodsController.prototype,
    ).filter((name) => name !== 'constructor');

    expect(methods).toEqual(['listPaymentMethods']);
  });
});

describe('PaymentMethodsController behaviour', () => {
  let controller: PaymentMethodsController;
  let service: { listPaymentMethods: jest.Mock };

  beforeEach(() => {
    service = { listPaymentMethods: jest.fn().mockResolvedValue([]) };
    controller = new PaymentMethodsController(
      service as unknown as PaymentMethodsService,
    );
  });

  it('hides inactive methods from a driver, whatever the query says', async () => {
    await controller.listPaymentMethods('true', {
      user: { role: 'chofer' },
    } as never);

    expect(service.listPaymentMethods).toHaveBeenCalledWith({
      includeInactive: false,
    });
  });

  it('lets an admin ask for the full list', async () => {
    await controller.listPaymentMethods('true', {
      user: { role: 'admin' },
    } as never);

    expect(service.listPaymentMethods).toHaveBeenCalledWith({
      includeInactive: true,
    });
  });

  it('returns only active methods to an admin by default', async () => {
    await controller.listPaymentMethods(undefined, {
      user: { role: 'admin' },
    } as never);

    expect(service.listPaymentMethods).toHaveBeenCalledWith({
      includeInactive: false,
    });
  });
});
