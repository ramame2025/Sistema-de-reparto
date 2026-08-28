import { ROLES_KEY } from '../auth/roles.decorator';
import { PricesController } from './prices.controller';

describe('PricesController role metadata', () => {
  // El chofer necesita la tabla para mostrar el total antes de cobrar. Sin
  // esto la app tendria que adivinar el precio, que es exactamente el bug que
  // esta fase cierra.
  it('lets a driver read the price table (GET /prices/table)', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, PricesController.prototype.getPriceTable);
    expect(roles).toEqual(['admin', 'chofer']);
  });

  // Leer si, escribir no: solo el admin define cuanto vale lo que se vende.
  it('leaves updatePrice admin-only via the class-level default', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, PricesController.prototype.updatePrice),
    ).toBeUndefined();
  });

  it('leaves listPrices admin-only via the class-level default', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, PricesController.prototype.listPrices),
    ).toBeUndefined();
  });

  it('keeps the class default at admin', () => {
    expect(Reflect.getMetadata(ROLES_KEY, PricesController)).toEqual(['admin']);
  });
});
