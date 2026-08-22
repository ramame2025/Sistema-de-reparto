import { ROLES_KEY } from '../auth/roles.decorator';
import { CustomersController } from './customers.controller';

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
});
