import type { PaymentMethod, PaymentMethodRecord, SaleRecord } from "@distribuidor/shared";

/**
 * Etiqueta del grupo que junta las ventas a cuenta sin cliente del padron.
 * Se exporta para que la pantalla y los tests hablen del mismo texto.
 */
export const UNIDENTIFIED_CUSTOMER_KEY = "Sin cliente identificado";

export type ReceivableGroup = {
  /** Cliente del padron, o `null` para el grupo sin identificar. */
  customerId: string | null;
  customerName: string;
  /**
   * Lo VENDIDO a cuenta, no el saldo actual: no existe modelo de cobros, asi
   * que nada baja este numero cuando el cliente paga.
   */
  soldOnAccount: number;
  salesCount: number;
  identified: boolean;
};

export type ReceivablesSummary = {
  groups: ReceivableGroup[];
  totalSoldOnAccount: number;
  salesCount: number;
  /** Cuantas ventas a cuenta quedaron sin cliente del padron. */
  unidentifiedCount: number;
};

/**
 * Si el medio de pago de la venta deja deuda.
 *
 * Se pregunta SIEMPRE por la bandera `createsDebt` y NUNCA se compara el
 * codigo contra 'cuenta_corriente'. Un futuro "fiado a 30 dias" aparece en
 * esta vista con un INSERT y ningun cambio de codigo. Ver decision D2 del
 * plan `docs/plans/current-account-sales.md`.
 *
 * Un medio ausente del catalogo cuenta como "no deja deuda": es la misma
 * respuesta conservadora que da el validador de ventas en `packages/shared`.
 * Sin catalogo no se sabe que medio deja deuda, y suponer que si dejaria
 * inventaria una deuda que nadie afirmo.
 */
const createsDebt = (
  paymentMethods: PaymentMethodRecord[],
  code: PaymentMethod | null,
): boolean => {
  if (!code) {
    return false;
  }

  return paymentMethods.find((method) => method.code === code)?.createsDebt ?? false;
};

const identifierOf = (sale: SaleRecord): string | null => {
  const customerId = sale.customerId?.trim();
  return customerId ? customerId : null;
};

/**
 * Cuentas por cobrar: cuanto se le VENDIO A CUENTA a cada cliente.
 *
 * NO es el saldo actual. Todavia no hay modelo de cobros, asi que ningun pago
 * baja estos numeros. Las dos cifras coinciden solo hasta el primer cobro y
 * despues divergen para siempre. La pantalla que consume esta funcion tiene
 * que decirlo con todas las letras.
 *
 * Las ventas anuladas quedan afuera, igual que en `summarize`: una venta
 * anulada nunca facturo y por lo tanto tampoco es deuda.
 *
 * Las ventas sin cliente del padron no se descartan: la fase 1 ya las impide,
 * pero pueden existir en datos viejos, y tirarlas escondería plata realmente
 * vendida a cuenta. Van a un grupo aparte, marcado, que queda ultimo porque
 * no se le puede reclamar a nadie hasta corregir el dato a mano.
 */
export function summarizeReceivables(
  sales: SaleRecord[],
  paymentMethods: PaymentMethodRecord[],
): ReceivablesSummary {
  const onAccount = sales.filter(
    (sale) => sale.status === "active" && createsDebt(paymentMethods, sale.paymentMethod),
  );

  const byCustomer = new Map<string, ReceivableGroup & { lastSeenAt: string }>();

  for (const sale of onAccount) {
    const customerId = identifierOf(sale);
    const key = customerId ?? UNIDENTIFIED_CUSTOMER_KEY;
    const existing = byCustomer.get(key);

    if (!existing) {
      byCustomer.set(key, {
        customerId,
        customerName: customerId ? sale.customerName : UNIDENTIFIED_CUSTOMER_KEY,
        soldOnAccount: sale.total,
        salesCount: 1,
        identified: customerId !== null,
        lastSeenAt: sale.createdAt,
      });
      continue;
    }

    existing.soldOnAccount += sale.total;
    existing.salesCount += 1;

    // El nombre del cliente viaja copiado en cada venta, asi que dos ventas
    // del mismo cliente pueden traer nombres distintos si se renombro en el
    // padron. Gana el mas reciente: el viejo ya no es como se lo conoce.
    if (customerId && sale.createdAt > existing.lastSeenAt) {
      existing.customerName = sale.customerName;
      existing.lastSeenAt = sale.createdAt;
    }
  }

  const groups = [...byCustomer.values()]
    .map(({ lastSeenAt: _lastSeenAt, ...group }) => group)
    .sort((a, b) => {
      // El grupo sin identificar va ultimo pase lo que pase: no es una deuda
      // reclamable, y arriba de todo desplazaria a los clientes que si lo son.
      if (a.identified !== b.identified) {
        return a.identified ? -1 : 1;
      }
      if (b.soldOnAccount !== a.soldOnAccount) {
        return b.soldOnAccount - a.soldOnAccount;
      }
      return a.customerName.localeCompare(b.customerName, "es");
    });

  const unidentified = groups.find((group) => !group.identified);

  return {
    groups,
    totalSoldOnAccount: groups.reduce((acc, group) => acc + group.soldOnAccount, 0),
    salesCount: onAccount.length,
    unidentifiedCount: unidentified?.salesCount ?? 0,
  };
}
