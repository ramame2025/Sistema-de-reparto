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
    // Mismo guard que `totalOfQueued` sobre `payload`: una entrada vieja de la
    // cola puede no traerlo.
    if (!entry.payload) {
      continue;
    }

    // Una entrada vieja del almacenamiento puede no tener fecha. Ante la duda
    // se CUENTA: una venta sin enviar es mas probablemente de hoy que de ayer,
    // y no contarla infla el remanente, que es el error que hace prometerle a
    // un cliente envases que ya no estan.
    if (entry.createdAt && entry.createdAt.slice(0, 10) !== today) {
      continue;
    }

    // La pregunta es "que salio del camion", y eso lo contestan los items, no
    // la clase de la fila. Una visita sin venta no descuenta porque no tiene
    // items; un cambio por falla SI descuenta, porque la unidad de reemplazo
    // salio del camion aunque nadie haya pagado. Escrito sobre el `kind`, el
    // cambio de envase obligaba a volver aca, y el proximo `kind` tambien.
    //
    // Lo que VUELVE (`returnedItems`, `swappedItems`) no se mira nunca: entra
    // al camion, no sale.
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
