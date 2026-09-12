import type { CreateSaleInput, ProductRecord, TruckStockLine } from '@distribuidor/shared';
import type { TruckStockCardLine } from '../components/TruckStockCard';
import type { PendingSale } from './offlineQueue';

/**
 * Lo que ya salio del camion pero el servidor todavia no sabe.
 *
 * Solo cuentan las de HOY, con el mismo criterio de "hoy" que usa
 * `todaySalesOf` y que aplica el endpoint: una venta encolada ayer no
 * pertenece al remito de hoy, y se va a contar sola el dia que sincronice.
 */
function queuedUnitsByProduct(
  pendingSales: PendingSale[],
  today: string,
): Map<string, number> {
  const units = new Map<string, number>();

  for (const entry of pendingSales) {
    // Una visita sin venta no baja nada del camion: no tiene items, y por eso
    // tampoco tiene lugar en esta cuenta. Mismo guard que `totalOfQueued`
    // sobre `payload`: una entrada vieja de la cola puede no traerlo.
    if (entry.kind === 'churn' || !entry.payload) {
      continue;
    }

    // Una entrada vieja del almacenamiento puede no tener fecha. Ante la duda
    // se CUENTA: una venta sin enviar es mas probablemente de hoy que de ayer,
    // y no contarla infla el remanente, que es el error que hace prometerle a
    // un cliente envases que ya no estan.
    if (entry.createdAt && entry.createdAt.slice(0, 10) !== today) {
      continue;
    }

    const items = (entry.payload as CreateSaleInput).items ?? [];
    for (const item of items) {
      units.set(item.productCode, (units.get(item.productCode) ?? 0) + item.quantity);
    }
  }

  return units;
}

/**
 * Las lineas que pinta la tarjeta: lo que el servidor calculo, menos lo que
 * sigue en la cola de este telefono.
 *
 * Sin este descuento la tarjeta le miente al chofer justo cuando mas la
 * necesita: sin senal, en la calle, con ventas hechas que el servidor todavia
 * no vio. `loaded` no se toca nunca -- la cola cambia lo que queda, no lo que
 * se cargo -- y el resultado no se clampea, por la misma razon que no lo
 * clampea la API: vender mas de lo cargado es un problema real que se tiene
 * que ver.
 */
export function buildTruckStockLines(
  lines: TruckStockLine[],
  pendingSales: PendingSale[],
  products: ProductRecord[],
  today: string,
): TruckStockCardLine[] {
  const queued = queuedUnitsByProduct(pendingSales, today);
  const names = new Map(products.map((product) => [product.code, product.name]));

  // Se respeta el orden del servidor, que ya viene en el orden que definio el
  // admin, en vez de reordenar por el catalogo: el catalogo trae solo los
  // activos y dejaria afuera un producto discontinuado que todavia viaja.
  return lines.map((line) => ({
    productCode: line.productCode,
    label: names.get(line.productCode) ?? line.productCode,
    loaded: line.loaded,
    remaining: line.remaining - (queued.get(line.productCode) ?? 0),
  }));
}
