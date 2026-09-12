/**
 * Los cuatro productos con los que arranco el sistema, hoy sembrados como las
 * primeras filas de la tabla `Product`.
 *
 * YA NO ES EL CATALOGO: el admin crea y da de baja productos, asi que esta
 * lista no es exhaustiva ni autoritativa. Sobrevive como fuente del seed y
 * como lista de fallback de las pantallas que todavia no consumen el catalogo
 * de la API. Validar contra ella rechazaria productos nuevos y legitimos: la
 * pertenencia se verifica contra la base, del lado del servidor.
 */
export const PRODUCT_CODES = [
  "G10",
  "G15",
  "G45",
  "G15_AUTO",
] as const;

/**
 * Codigo de producto tal como viaja por la API. Es un string abierto, no una
 * union cerrada: el catalogo lo define el admin en runtime. El codigo es
 * estable e inmutable una vez creado, porque ya viaja dentro de los payloads
 * encolados offline en los telefonos de los choferes.
 */
export type ProductCode = string;

/**
 * Valida la FORMA de un codigo de producto, no su pertenencia al catalogo.
 *
 * `packages/shared` corre en el telefono y en el navegador, y ninguno de los
 * dos conoce el catalogo: lo define el admin en runtime. Comprobar pertenencia
 * aca rechazaria todo producto nuevo y legitimo. Que el codigo EXISTA se
 * verifica contra la tabla `Product`, del lado del servidor, que es el unico
 * lugar que tiene la respuesta.
 */
export function isWellFormedProductCode(code: unknown): boolean {
  return typeof code === "string" && code.trim().length > 0;
}

/**
 * Categoria de cliente tal como viaja por la API. Es un string abierto, no una
 * union cerrada: las categorias las define el admin en runtime, en la tabla
 * `CustomerCategory`. El codigo es estable e inmutable una vez creado, porque
 * ya viaja dentro de los payloads de venta encolados offline en los telefonos.
 */
export type CustomerType = string;

/**
 * Tan largo como el codigo de una zona o un producto, y por la misma razon:
 * es una clave que se teclea y se lee, no un texto libre.
 */
export const CUSTOMER_TYPE_MAX_LENGTH = 20;

/**
 * Valida la FORMA de una categoria de cliente, no su pertenencia al catalogo.
 *
 * Mismo criterio que `isWellFormedProductCode`, y por el mismo motivo:
 * `packages/shared` corre en el telefono y en el navegador, y ninguno de los
 * dos conoce la lista de categorias. Comprobar pertenencia aca rechazaria toda
 * categoria nueva y legitima, y peor: rechazaria una venta encolada con una
 * categoria creada despues de la ultima sincronizacion. Que la categoria
 * EXISTA se verifica contra la tabla, del lado del servidor.
 *
 * A proposito NO se exige mayusculas: las tres categorias semilla ('final',
 * 'comercio', 'distribuidor') vienen del enum viejo y su codigo es inmutable.
 */
export function isWellFormedCustomerType(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= CUSTOMER_TYPE_MAX_LENGTH;
}

export const PAYMENT_METHODS = [
  "efectivo",
  "transferencia",
  "qr",
  "tarjeta",
] as const;

export const EXPENSE_CATEGORIES = [
  'combustible',
  'peaje',
  'comida',
  'mantenimiento',
  'varios',
] as const;

export const USER_ROLES = ['admin', 'chofer'] as const;

export const ASSIGNMENT_KINDS = ['titular', 'cobertura'] as const;

export const SALE_KINDS = ['sale', 'churn'] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type UserRole = (typeof USER_ROLES)[number];
export type AssignmentKind = (typeof ASSIGNMENT_KINDS)[number];
export type SaleKind = (typeof SALE_KINDS)[number];

/**
 * La tabla de precios es RALA a proposito, en sus dos niveles: puede faltar un
 * tipo de cliente entero, y puede faltar un producto dentro de un tipo que si
 * esta. Un tipo de cliente nace incompleto -- se crea primero y se le cargan
 * los precios despues -- asi que el agujero es un estado legitimo del sistema,
 * no una tabla corrupta.
 *
 * `Partial` en los dos niveles no es cosmetico: es lo que hace que TypeScript
 * devuelva `number | undefined` al indexar y obligue a cada lector a decidir
 * que hacer con el agujero. Un `Record` liso mentia diciendo `number`, y esa
 * mentira es la que habilitaba los `?? 0` que vendian gratis.
 */
export type PriceTable = Partial<
  Record<CustomerType, Partial<Record<ProductCode, number>>>
>;

export type SaleItemInput = {
  productCode: ProductCode;
  quantity: number;
};

export type CreateSaleInput = {
  clientGeneratedId?: string;
  /**
   * Cuando ocurrio la venta, en ISO, segun el reloj del telefono. Opcional:
   * los payloads viejos ya encolados no lo traen. El servidor lo acota con
   * `resolveOccurredAt` antes de creerle.
   */
  occurredAt?: string;
  driverName: string;
  truckCode?: string;
  customerName: string;
  customerType: CustomerType;
  paymentMethod: PaymentMethod;
  items: SaleItemInput[];
  note?: string;
  customerId?: string;
  truckId?: string;
  containerReturned?: boolean;
  paymentProofRef?: string;
  latitude?: number;
  longitude?: number;
};

/**
 * Payload para registrar una visita sin venta (churn): container devuelto,
 * nada vendido. A proposito NO tiene `items` ni `paymentMethod` -- esos
 * campos no existen en este input, se fuerzan server-side en
 * `recordEmptyVisit` (fuera de scope de esta unidad).
 */
export type RecordEmptyVisitInput = {
  /** Cuando ocurrio la visita, en ISO. Ver `CreateSaleInput.occurredAt`. */
  occurredAt?: string;
  clientGeneratedId?: string;
  driverName: string;
  truckCode?: string;
  truckId?: string;
  customerName: string;
  customerType: CustomerType;
  customerId?: string;
  note?: string;
};

export type UpdateSaleInput = CreateSaleInput & {
  reason: string;
  /**
   * Hint de validacion solamente: le dice al validador puro si debe saltear
   * los chequeos de paymentMethod/items. El service SIEMPRE revalida contra
   * el `kind` almacenado en la fila real antes de aplicar el cambio -- este
   * campo nunca es la unica fuente de verdad.
   */
  kind?: SaleKind;
};

/**
 * Una linea tal como quedo GRABADA, no como se pidio: incluye el precio
 * unitario congelado en el momento de la venta.
 */
export type SaleItemRecord = SaleItemInput & {
  unitPrice: number;
};

export type SaleRecord = {
  id: string;
  createdAt: string;
  /**
   * Cuando ocurrio la venta en la calle. Distinto de `createdAt`, que es
   * cuando la fila entro: una venta sin senal se sincroniza mas tarde.
   */
  occurredAt: string;
  status: "active" | "canceled";
  canceledAt?: string;
  cancelReason?: string;
  driverName: string;
  truckCode?: string;
  total: number;
  customerName: string;
  customerType: CustomerType;
  /**
   * Cliente del padron al que quedo enganchada la venta, si hubo uno.
   * Devolverlo no es cosmetico: `updateSale` reescribe el vinculo con lo que
   * venga en el payload, y `resolveCustomerAndTruck` interpreta la ausencia
   * de `customerId` como "desenganchar". Sin este campo en la respuesta, un
   * cliente que edita una venta no tiene forma de conservar el vinculo, y
   * cada edicion lo borraria en silencio.
   */
  customerId?: string;
  /**
   * `null` para una fila de churn (`kind === 'churn'`): no hubo pago, es el
   * hecho de negocio real, no un dato faltante. Toda fila `kind === 'sale'`
   * sigue teniendo un `PaymentMethod` valido.
   */
  paymentMethod: PaymentMethod | null;
  items: SaleItemRecord[];
  note?: string;
  kind: SaleKind;
  containerReturned?: boolean;
  paymentProofRef?: string;
  latitude?: number;
  longitude?: number;
};

export type CancelSaleInput = {
  reason: string;
};

export type SaleAuditAction = 'created' | 'edited' | 'canceled';

export type SaleAuditRecord = {
  id: string;
  saleId: string;
  action: SaleAuditAction;
  reason: string;
  createdAt: string;
};

export type CreateExpenseInput = {
  driverName: string;
  category: ExpenseCategory;
  amount: number;
  note?: string;
  receiptRef?: string;
};

export type ExpenseRecord = {
  id: string;
  createdAt: string;
  driverName: string;
  category: ExpenseCategory;
  amount: number;
  note?: string;
  receiptRef?: string;
};

export type LoadManifestItemInput = {
  productCode: ProductCode;
  quantity: number;
};

export type CreateLoadManifestInput = {
  driverName: string;
  truckId: string;
  truckCode?: string;
  items: LoadManifestItemInput[];
  photoRef?: string;
  note?: string;
};

export type LoadManifestRecord = {
  id: string;
  createdAt: string;
  driverName: string;
  truckId: string;
  truckCode?: string;
  items: LoadManifestItemInput[];
  photoRef?: string;
  note?: string;
};

export type TruckStockLine = {
  productCode: ProductCode;
  loaded: number;
  sold: number;
  remaining: number;
};

export type TruckStockSummary = {
  truckId: string;
  asOf: string;
  lines: TruckStockLine[];
};

/**
 * Stock de UN dia, no acumulado: lo que entro en el remito de `date` menos lo
 * vendido ese mismo dia. Es una pregunta distinta de la que contesta
 * `TruckStockSummary`, que arrastra el saldo historico del camion: el chofer
 * mira su remito de hoy, no el balance de vida del camion.
 *
 * `manifestAt` es el instante del ULTIMO remito del dia (un dia puede tener
 * mas de uno). `null` significa "hoy todavia no se cargo nada", y entonces las
 * lineas valen cero pero siguen viajando: sin ellas el cliente no sabe que
 * productos existen.
 */
export type TruckDayStock = {
  truckId: string;
  date: string;
  manifestAt: string | null;
  lines: TruckStockLine[];
};

/**
 * Igual que `MyTruckResponse` en driver-truck-assignments: el sobre nunca es
 * `null` pelado, asi el cliente distingue "hoy no manejas" (`stock: null`) de
 * una respuesta rota, y sabe para que dia se resolvio.
 */
export type MyTruckStockResponse = {
  date: string;
  stock: TruckDayStock | null;
};

export type LoginInput = {
  username: string;
  password: string;
};

export type AuthLoginResponse = {
  accessToken: string;
  username: string;
  role: UserRole;
  expiresInSeconds: number;
};

export type AuthSessionResponse = {
  username: string;
  role: UserRole;
};

/** El camion que un chofer maneja HOY, resuelto por la regla de especificidad. */
export type CurrentTruckSummary = {
  truckId: string;
  code: string;
  kind: AssignmentKind;
};

export type UserSummary = {
  id: string;
  username: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
  /**
   * Solo se completa para choferes: los admin no manejan. `null` significa
   * "no tiene camion hoy", que es distinto de "no aplica".
   */
  currentTruck?: CurrentTruckSummary | null;
};

export type CreateUserInput = {
  username: string;
  password: string;
  role: UserRole;
};

export type ChangePasswordInput = {
  password: string;
};

export type CreateCustomerInput = {
  name: string;
  customerType: CustomerType;
  /**
   * Fila de `Zone`, la lista que administra el admin. Es lo que decide si dos
   * clientes con el mismo nombre son el mismo: una FK, no cuatro grafias.
   */
  zoneId?: string;
  /**
   * Human-readable street address. Independent from latitude/longitude:
   * a customer may carry a pin, an address, both, or neither. Nothing
   * geocodes one into the other (plan decision D2).
   */
  address?: string;
  latitude?: number;
  longitude?: number;
};

/**
 * Every field optional — a patch touches only what it names. `null` on
 * `zoneId`, `address` or the coordinate pair clears the stored value, which
 * `undefined` cannot express.
 */
export type UpdateCustomerInput = {
  name?: string;
  customerType?: CustomerType;
  zoneId?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  isActive?: boolean;
};

export type CustomerRecord = {
  id: string;
  name: string;
  customerType: CustomerType;
  /** Fila de `Zone` a la que pertenece el cliente, si tiene una asignada. */
  zoneId?: string;
  /**
   * Nombre para mostrar de esa zona, resuelto SIEMPRE desde la relacion: la
   * columna sombra homonima ya no existe. Sigue siendo el mismo campo de
   * siempre, asi que quien solo lo renderiza -- el aviso de duplicado del
   * chofer, por ejemplo -- no se entera del cambio. Es de solo lectura: para
   * asignar una zona esta `zoneId`, y no hay otra forma.
   */
  zone?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProductRecord = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

/**
 * Un producto nace CON un precio por cada categoria de cliente ACTIVA, en la
 * misma transaccion. No es una comodidad: la tabla de precios tolera agujeros
 * -- los omite en vez de fallar entera -- pero un producto sin precio no se
 * puede vender a la categoria que quedo sin el, y el chofer se entera recien
 * frente al cliente. Que un producto exista sin precios es evitable, asi que
 * se evita.
 *
 * Cuales son esas categorias solo lo sabe el servidor, asi que la regla se
 * verifica en `ProductsService.createProduct` y NO en el validador puro, que
 * corre en el telefono y en el navegador. El validador solo mira que cada
 * precio que SI vino sea un entero no negativo.
 *
 * El caso inverso -- una categoria nueva -- es deliberadamente el opuesto:
 * nace sin ningun precio, y los productos existentes simplemente no tienen
 * celda para ella hasta que el admin la cargue. Nada se backfillea, porque un
 * precio heredado miente en silencio y una celda vacia se ve.
 */
export type CreateProductInput = {
  code: string;
  name: string;
  sortOrder?: number;
  prices: Record<CustomerType, number>;
};

/**
 * El `code` no se puede cambiar, y por eso no esta aca. Ya viaja dentro de los
 * payloads de venta encolados en los telefonos de los choferes: renombrarlo
 * dejaria esas ventas apuntando a un producto inexistente.
 */
export type UpdateProductInput = {
  name?: string;
  isActive?: boolean;
  sortOrder?: number;
};

export type ZoneRecord = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateZoneInput = {
  code: string;
  name: string;
  sortOrder?: number;
};

/**
 * El `code` no se puede cambiar, y por eso no esta aca. Es la clave estable de
 * la zona, igual que la del producto: se renombra el `name`, que es lo unico
 * que se muestra.
 */
export type UpdateZoneInput = {
  name?: string;
  isActive?: boolean;
  sortOrder?: number;
};

export type CustomerCategoryRecord = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateCustomerCategoryInput = {
  code: string;
  name: string;
  sortOrder?: number;
};

/**
 * El `code` no se puede cambiar, y por eso no esta aca. Ya viaja dentro de los
 * payloads de venta encolados en los telefonos, igual que el codigo de
 * producto: renombrarlo dejaria esas ventas apuntando a una categoria
 * inexistente.
 */
export type UpdateCustomerCategoryInput = {
  name?: string;
  isActive?: boolean;
  sortOrder?: number;
};

/**
 * Cuantas unidades de UN producto entran en el camion. La capacidad dejo de
 * ser un numero unico: un total no dice que carga entra, y no se puede
 * repartir entre productos sin inventar el reparto.
 *
 * `units: 0` es una respuesta real -- "este producto no viaja en este
 * camion" -- y por eso se guarda como fila, en vez de omitirse.
 */
export type TruckCapacityEntry = {
  productCode: ProductCode;
  units: number;
};

export type CreateTruckInput = {
  code: string;
  plate: string;
};

export type TruckRecord = {
  id: string;
  code: string;
  plate: string;
  /**
   * La grilla por producto, ordenada como el catalogo. Un array vacio
   * significa "sin detallar", NO "no entra nada": por eso no hay aca ningun
   * total derivado -- un `capacity: 0` calculado seria exactamente esa
   * mentira.
   */
  capacities: TruckCapacityEntry[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Todos los campos son opcionales: se actualiza solo lo que viene. */
export type UpdateTruckInput = {
  code?: string;
  plate?: string;
  isActive?: boolean;
};

/**
 * Reemplazo TOTAL de la grilla del camion, nunca un merge. Con un merge
 * parcial "sacar este producto del camion" no se podria expresar: mandar la
 * lista entera es lo que hace que una fila ausente signifique borrada. Mismo
 * contrato que `CreateDriverCustomerAssignmentInput`.
 */
export type SetTruckCapacitiesInput = {
  capacities: TruckCapacityEntry[];
};

export type CreateAssignmentInput = {
  driverId: string;
  truckId: string;
  /**
   * `titular`: el camion es de ese chofer. `endDate` opcional (null mientras
   * siga vigente). `cobertura`: dias puntuales en los que otro chofer maneja
   * el camion, y por eso `endDate` es obligatorio: una cobertura sin fin no
   * seria una cobertura, seria un cambio de titular.
   */
  kind: AssignmentKind;
  startDate: string;
  endDate?: string;
};

export type UpdatePriceInput = {
  amount: number;
};

/**
 * Lista de clientes a visitar de un chofer en un dia puntual. Envelope
 * resuelto (no bare `customerId[]`): reusa `CustomerRecord` tal cual, sin
 * duplicar su forma.
 */
export type DriverCustomerAssignmentRecord = {
  id: string;
  driverId: string;
  date: string; // YYYY-MM-DD
  customers: CustomerRecord[]; // preserva el orden asignado
  createdAt: string;
  updatedAt: string;
};

export type CreateDriverCustomerAssignmentInput = {
  driverId: string;
  date: string; // YYYY-MM-DD
  customerIds: string[];
};

/** Respuesta de GET /driver-customer-assignments/me — 200 con lista vacia, nunca 404. */
export type MyAssignedCustomersResponse = {
  date: string;
  customers: CustomerRecord[];
};

/** Tamano de pagina fijo del historial de asignaciones (vista admin). */
export const DRIVER_CUSTOMER_ASSIGNMENT_HISTORY_PAGE_SIZE = 15;

/**
 * Filtros del historial paginado de asignaciones. Todos opcionales: sin
 * filtros devuelve la primera pagina de todo el historial, mas nuevo primero.
 * `from`/`to` son inclusivos y se comparan por dia entero (misma convencion
 * UTC-midnight que el resto del servicio). `customerId` matchea las
 * asignaciones cuya lista del dia incluye a ese cliente.
 */
export type DriverCustomerAssignmentHistoryQuery = {
  driverId?: string;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
  customerId?: string;
  page?: number; // 1-based
};

/**
 * Una pagina del historial. `page` y `totalPages` vienen ya normalizados por
 * el servidor (page >= 1, totalPages >= 1) para que el pager del dashboard no
 * tenga que recalcularlos.
 */
export type DriverCustomerAssignmentHistoryResponse = {
  items: DriverCustomerAssignmentRecord[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export const DEFAULT_PRICE_TABLE: PriceTable = {
  final: { G10: 8500, G15: 13000, G45: 39000, G15_AUTO: 14500 },
  comercio: { G10: 8200, G15: 12600, G45: 38000, G15_AUTO: 14000 },
  distribuidor: { G10: 7900, G15: 12100, G45: 36500, G15_AUTO: 13600 },
};

/** El par que no tiene precio, nombrado entero: sin el no se sabe que cargar. */
export type MissingPrice = {
  customerType: CustomerType;
  productCode: ProductCode;
};

export type UnitPriceResult =
  | { ok: true; unitPrice: number }
  | { ok: false; missing: MissingPrice };

/**
 * La UNICA forma sancionada de leer un precio en todo el codigo.
 *
 * Existe para que "no hay precio" no se pueda confundir nunca con "el precio
 * es cero": cero es un precio real que el admin puede fijar, y un `?? 0` que
 * los mezcla vende gratis sin que nadie se entere. Devolver el par faltante,
 * y no solo un `undefined`, es lo que despues permite decir exactamente que
 * falta cargar.
 */
export function findUnitPrice(
  prices: PriceTable,
  customerType: CustomerType,
  productCode: ProductCode,
): UnitPriceResult {
  const unitPrice = prices[customerType]?.[productCode];

  if (unitPrice === undefined) {
    return { ok: false, missing: { customerType, productCode } };
  }

  return { ok: true, unitPrice };
}

export type PricedSaleItem = {
  productCode: ProductCode;
  quantity: number;
  unitPrice: number;
};

export type PricedSaleResult =
  | { ok: true; items: PricedSaleItem[]; total: number }
  | { ok: false; missing: MissingPrice[] };

/**
 * Valoriza una venta entera, o dice que pares le faltan.
 *
 * Devuelve las lineas Y el total juntos porque el total se deriva de esas
 * mismas lineas: asi total e items no pueden discrepar nunca, que es la
 * invariante de la que ya dependia la API al grabar la venta.
 *
 * Informa TODOS los pares faltantes, no el primero: quien tiene que cargar
 * los precios los ve de una sola vez, en lugar de descubrirlos de a uno por
 * intento de venta.
 */
export function priceSaleItems(
  customerType: CustomerType,
  items: SaleItemInput[],
  prices: PriceTable,
): PricedSaleResult {
  const priced: PricedSaleItem[] = [];
  const missing: MissingPrice[] = [];
  const alreadyReported = new Set<ProductCode>();

  for (const item of items) {
    const result = findUnitPrice(prices, customerType, item.productCode);

    if (!result.ok) {
      // El mismo producto repetido en dos lineas es un solo precio faltante:
      // repetirlo solo ensuciaria el mensaje de error.
      if (!alreadyReported.has(item.productCode)) {
        alreadyReported.add(item.productCode);
        missing.push(result.missing);
      }
      continue;
    }

    priced.push({
      productCode: item.productCode,
      quantity: item.quantity,
      unitPrice: result.unitPrice,
    });
  }

  if (missing.length > 0) {
    return { ok: false, missing };
  }

  const total = priced.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0,
  );

  return { ok: true, items: priced, total };
}

export function validateCreateSaleInput(input: CreateSaleInput): string[] {
  const errors: string[] = [];

  if (
    input.clientGeneratedId !== undefined &&
    input.clientGeneratedId.trim().length < 8
  ) {
    errors.push('clientGeneratedId must have at least 8 characters when provided');
  }

  if (!input.customerName || input.customerName.trim().length < 2) {
    errors.push("customerName must have at least 2 characters");
  }

  if (!input.driverName || input.driverName.trim().length < 2) {
    errors.push('driverName must have at least 2 characters');
  }

  if (input.truckCode && input.truckCode.trim().length < 2) {
    errors.push('truckCode must have at least 2 characters when provided');
  }

  if (input.customerId !== undefined && input.customerId.trim().length === 0) {
    errors.push('customerId must not be empty when provided');
  }

  if (input.truckId !== undefined && input.truckId.trim().length === 0) {
    errors.push('truckId must not be empty when provided');
  }

  if (!isWellFormedCustomerType(input.customerType)) {
    errors.push("customerType is invalid");
  }

  if (!PAYMENT_METHODS.includes(input.paymentMethod)) {
    errors.push("paymentMethod is invalid");
  }

  if (!Array.isArray(input.items) || input.items.length === 0) {
    errors.push("items must include at least one product");
  }

  if (Array.isArray(input.items)) {
    input.items.forEach((item, index) => {
      if (!isWellFormedProductCode(item.productCode)) {
        errors.push(`items[${index}].productCode is invalid`);
      }

      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        errors.push(`items[${index}].quantity must be an integer greater than 0`);
      }
    });
  }

  if (input.paymentProofRef !== undefined && input.paymentProofRef.trim().length === 0) {
    errors.push('paymentProofRef must not be empty when provided');
  }

  if ((input.latitude !== undefined) !== (input.longitude !== undefined)) {
    errors.push('latitude and longitude must be provided together');
  }

  if (
    input.latitude !== undefined &&
    (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90)
  ) {
    errors.push('latitude must be between -90 and 90');
  }

  if (
    input.longitude !== undefined &&
    (!Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180)
  ) {
    errors.push('longitude must be between -180 and 180');
  }

  return errors;
}

export function validateRecordEmptyVisitInput(input: RecordEmptyVisitInput): string[] {
  const errors: string[] = [];

  if (
    input.clientGeneratedId !== undefined &&
    input.clientGeneratedId.trim().length < 8
  ) {
    errors.push('clientGeneratedId must have at least 8 characters when provided');
  }

  if (!input.customerName || input.customerName.trim().length < 2) {
    errors.push("customerName must have at least 2 characters");
  }

  if (!input.driverName || input.driverName.trim().length < 2) {
    errors.push('driverName must have at least 2 characters');
  }

  if (input.truckCode && input.truckCode.trim().length < 2) {
    errors.push('truckCode must have at least 2 characters when provided');
  }

  if (input.customerId !== undefined && input.customerId.trim().length === 0) {
    errors.push('customerId must not be empty when provided');
  }

  if (input.truckId !== undefined && input.truckId.trim().length === 0) {
    errors.push('truckId must not be empty when provided');
  }

  if (!isWellFormedCustomerType(input.customerType)) {
    errors.push("customerType is invalid");
  }

  return errors;
}

function validateSaleIdentityFields(input: UpdateSaleInput): string[] {
  const errors: string[] = [];

  if (
    input.clientGeneratedId !== undefined &&
    input.clientGeneratedId.trim().length < 8
  ) {
    errors.push('clientGeneratedId must have at least 8 characters when provided');
  }

  if (!input.customerName || input.customerName.trim().length < 2) {
    errors.push("customerName must have at least 2 characters");
  }

  if (!input.driverName || input.driverName.trim().length < 2) {
    errors.push('driverName must have at least 2 characters');
  }

  if (input.truckCode && input.truckCode.trim().length < 2) {
    errors.push('truckCode must have at least 2 characters when provided');
  }

  if (input.customerId !== undefined && input.customerId.trim().length === 0) {
    errors.push('customerId must not be empty when provided');
  }

  if (input.truckId !== undefined && input.truckId.trim().length === 0) {
    errors.push('truckId must not be empty when provided');
  }

  if (!isWellFormedCustomerType(input.customerType)) {
    errors.push("customerType is invalid");
  }

  return errors;
}

export function validateUpdateSaleInput(input: UpdateSaleInput): string[] {
  // input.kind is a validation hint only: it tells the pure validator whether
  // to skip paymentMethod/items checks. The service re-verifies it against
  // the stored row's kind before applying any change (never trusted alone).
  const errors =
    input.kind === 'churn'
      ? validateSaleIdentityFields(input)
      : validateCreateSaleInput(input);

  if (!input.reason || input.reason.trim().length < 3) {
    errors.push('reason must have at least 3 characters');
  }

  return errors;
}

export function validateCancelSaleInput(input: CancelSaleInput): string[] {
  const errors: string[] = [];

  if (!input.reason || input.reason.trim().length < 3) {
    errors.push('reason must have at least 3 characters');
  }

  return errors;
}

export function validateCreateExpenseInput(input: CreateExpenseInput): string[] {
  const errors: string[] = [];

  if (!input.driverName || input.driverName.trim().length < 2) {
    errors.push('driverName must have at least 2 characters');
  }

  if (!EXPENSE_CATEGORIES.includes(input.category)) {
    errors.push('category is invalid');
  }

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    errors.push('amount must be greater than 0');
  }

  if (input.note && input.note.length > 300) {
    errors.push('note max length is 300');
  }

  return errors;
}

export function validateCreateLoadManifestInput(input: CreateLoadManifestInput): string[] {
  const errors: string[] = [];

  if (!input.truckId || input.truckId.trim().length === 0) {
    errors.push('truckId is required');
  }

  if (!Array.isArray(input.items) || input.items.length === 0) {
    errors.push('items must include at least one product');
  }

  if (Array.isArray(input.items)) {
    input.items.forEach((item, index) => {
      if (!isWellFormedProductCode(item.productCode)) {
        errors.push(`items[${index}].productCode is invalid`);
      }

      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        errors.push(`items[${index}].quantity must be an integer greater than 0`);
      }
    });
  }

  if (input.photoRef !== undefined && input.photoRef.trim().length === 0) {
    errors.push('photoRef must not be empty when provided');
  }

  if (input.note !== undefined && input.note.trim().length === 0) {
    errors.push('note must not be empty when provided');
  }

  return errors;
}

export function validateLoginInput(input: LoginInput): string[] {
  const errors: string[] = [];

  if (!input.username || input.username.trim().length < 2) {
    errors.push('username must have at least 2 characters');
  }

  if (!input.password || input.password.length < 4) {
    errors.push('password must have at least 4 characters');
  }

  return errors;
}

export function validateCreateUserInput(input: CreateUserInput): string[] {
  const errors: string[] = [];

  if (!input.username || input.username.trim().length < 3) {
    errors.push('username must have at least 3 characters');
  }

  if (!input.password || input.password.length < 6) {
    errors.push('password must have at least 6 characters');
  }

  if (!USER_ROLES.includes(input.role)) {
    errors.push('role is invalid');
  }

  return errors;
}

export function validateChangePasswordInput(input: ChangePasswordInput): string[] {
  const errors: string[] = [];

  if (!input.password || input.password.length < 6) {
    errors.push('password must have at least 6 characters');
  }

  return errors;
}

const LATITUDE_ERROR = 'latitude must be between -90 and 90';
const LONGITUDE_ERROR = 'longitude must be between -180 and 180';
const COORDINATE_PAIR_ERROR = 'latitude and longitude must be provided together';

function isInvalidLatitude(value: number): boolean {
  return !Number.isFinite(value) || value < -90 || value > 90;
}

function isInvalidLongitude(value: number): boolean {
  return !Number.isFinite(value) || value < -180 || value > 180;
}

/**
 * Canonical form used to decide whether two customer names are "the same"
 * for duplicate detection. Accent folding is not cosmetic here: without it
 * "Don Jose" and "Don José" slip past the check on the very first try.
 */
export function normalizeCustomerName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function validateCreateCustomerInput(input: CreateCustomerInput): string[] {
  const errors: string[] = [];

  if (!input.name || input.name.trim().length < 2) {
    errors.push('name must have at least 2 characters');
  }

  if (!isWellFormedCustomerType(input.customerType)) {
    errors.push('customerType is invalid');
  }

  if (input.zoneId !== undefined && input.zoneId.trim().length === 0) {
    errors.push('zoneId must not be empty when provided');
  }

  if (input.address !== undefined && input.address.trim().length === 0) {
    errors.push('address must not be empty when provided');
  }

  if (input.latitude !== undefined && isInvalidLatitude(input.latitude)) {
    errors.push(LATITUDE_ERROR);
  }

  if (input.longitude !== undefined && isInvalidLongitude(input.longitude)) {
    errors.push(LONGITUDE_ERROR);
  }

  // A record holding one half of the pair looks located but cannot be
  // ranked by sortByProximity, so it would drop out of "Cerca tuyo"
  // without anyone noticing.
  if ((input.latitude === undefined) !== (input.longitude === undefined)) {
    errors.push(COORDINATE_PAIR_ERROR);
  }

  return errors;
}

export function validateUpdateCustomerInput(input: UpdateCustomerInput): string[] {
  const errors: string[] = [];

  const touched =
    input.name !== undefined ||
    input.customerType !== undefined ||
    input.zoneId !== undefined ||
    input.address !== undefined ||
    input.latitude !== undefined ||
    input.longitude !== undefined ||
    input.isActive !== undefined;

  if (!touched) {
    errors.push('at least one field must be provided');
  }

  if (input.name !== undefined && input.name.trim().length < 2) {
    errors.push('name must have at least 2 characters');
  }

  if (
    input.customerType !== undefined &&
    !isWellFormedCustomerType(input.customerType)
  ) {
    errors.push('customerType is invalid');
  }

  if (
    input.zoneId !== undefined &&
    input.zoneId !== null &&
    input.zoneId.trim().length === 0
  ) {
    errors.push('zoneId must not be empty when provided');
  }

  if (
    input.address !== undefined &&
    input.address !== null &&
    input.address.trim().length === 0
  ) {
    errors.push('address must not be empty when provided');
  }

  if (
    input.latitude !== undefined &&
    input.latitude !== null &&
    isInvalidLatitude(input.latitude)
  ) {
    errors.push(LATITUDE_ERROR);
  }

  if (
    input.longitude !== undefined &&
    input.longitude !== null &&
    isInvalidLongitude(input.longitude)
  ) {
    errors.push(LONGITUDE_ERROR);
  }

  // Both halves move together or neither does — including when clearing,
  // where both must be null.
  if ((input.latitude === undefined) !== (input.longitude === undefined)) {
    errors.push(COORDINATE_PAIR_ERROR);
  }

  if (input.isActive !== undefined && typeof input.isActive !== 'boolean') {
    errors.push('isActive must be a boolean');
  }

  return errors;
}

export function validateCreateTruckInput(input: CreateTruckInput): string[] {
  const errors: string[] = [];

  if (!input.code || input.code.trim().length < 1) {
    errors.push('code must have at least 1 character');
  }

  if (!input.plate || input.plate.trim().length < 1) {
    errors.push('plate must have at least 1 character');
  }

  return errors;
}

/**
 * Valida la grilla de capacidad. Como en todo el paquete, de los codigos de
 * producto se comprueba la FORMA y no la pertenencia: el catalogo lo define el
 * admin en runtime y ni el telefono ni el navegador lo conocen. Que el
 * producto EXISTA lo asegura el servidor con `assertProductCodesExist`.
 */
export function validateSetTruckCapacitiesInput(
  input: SetTruckCapacitiesInput,
): string[] {
  const errors: string[] = [];

  if (!Array.isArray(input.capacities)) {
    errors.push('capacities must be an array');
    return errors;
  }

  const seen = new Set<string>();

  for (const entry of input.capacities) {
    if (!isWellFormedProductCode(entry?.productCode)) {
      errors.push('productCode is invalid');
      continue;
    }

    // Dos filas del mismo producto no tienen respuesta posible: cual de las
    // dos seria la capacidad? Se rechaza aca y no se deja que lo haga el
    // unique de la base, que contestaria un 500 sin nombrar el producto.
    if (seen.has(entry.productCode)) {
      errors.push(`productCode ${entry.productCode} is duplicated`);
    }
    seen.add(entry.productCode);

    // 0 es una capacidad valida y significativa, asi que se compara contra
    // el numero y nunca con un `if (!entry.units)`.
    if (!Number.isInteger(entry.units) || entry.units < 0) {
      errors.push('units must be a non-negative integer');
    }
  }

  return errors;
}

export function validateUpdateTruckInput(input: UpdateTruckInput): string[] {
  const errors: string[] = [];

  const touched =
    input.code !== undefined ||
    input.plate !== undefined ||
    input.isActive !== undefined;

  if (!touched) {
    errors.push('at least one field must be provided');
  }

  if (input.code !== undefined && input.code.trim().length < 1) {
    errors.push('code must have at least 1 character');
  }

  if (input.plate !== undefined && input.plate.trim().length < 1) {
    errors.push('plate must have at least 1 character');
  }

  if (input.isActive !== undefined && typeof input.isActive !== 'boolean') {
    errors.push('isActive must be a boolean');
  }

  return errors;
}

export function validateCreateAssignmentInput(input: CreateAssignmentInput): string[] {
  const errors: string[] = [];

  if (!input.driverId || input.driverId.trim().length === 0) {
    errors.push('driverId is required');
  }

  if (!ASSIGNMENT_KINDS.includes(input.kind)) {
    errors.push(`kind must be one of: ${ASSIGNMENT_KINDS.join(', ')}`);
  }

  if (input.kind === 'cobertura' && input.endDate === undefined) {
    errors.push('endDate is required for a cobertura assignment');
  }

  if (!input.truckId || input.truckId.trim().length === 0) {
    errors.push('truckId is required');
  }

  const startDate = new Date(input.startDate);
  const startDateValid = !Number.isNaN(startDate.getTime());

  if (!input.startDate || !startDateValid) {
    errors.push('startDate must be a valid date');
  }

  if (input.endDate !== undefined) {
    const endDate = new Date(input.endDate);
    const endDateValid = !Number.isNaN(endDate.getTime());

    if (!endDateValid) {
      errors.push('endDate must be a valid date');
    } else if (startDateValid && endDate.getTime() < startDate.getTime()) {
      errors.push('endDate must not be before startDate');
    }
  }

  return errors;
}

export function validateUpdatePriceInput(input: UpdatePriceInput): string[] {
  const errors: string[] = [];

  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    errors.push('amount must be a positive integer');
  }

  return errors;
}

/**
 * `customerIds: []` es valido (vacia la lista del dia, Spec "An empty array
 * clears the list"): no se rechaza por vacio, solo por duplicados o campos
 * de identidad faltantes/invalidos.
 */
export function validateCreateDriverCustomerAssignmentInput(
  input: CreateDriverCustomerAssignmentInput,
): string[] {
  const errors: string[] = [];

  if (!input.driverId || input.driverId.trim().length === 0) {
    errors.push('driverId is required');
  }

  if (!input.date || input.date.trim().length === 0) {
    errors.push('date is required');
  } else if (Number.isNaN(new Date(input.date).getTime())) {
    errors.push('date must be a valid date');
  }

  const uniqueCount = new Set(input.customerIds).size;
  if (uniqueCount !== input.customerIds.length) {
    errors.push('duplicate customerId');
  }

  return errors;
}

const PRODUCT_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_]*$/;
const PRODUCT_CODE_MAX_LENGTH = 20;

function validateProductPrice(
  customerType: CustomerType,
  amount: number,
  errors: string[],
): void {
  if (!Number.isInteger(amount) || amount < 0) {
    errors.push(`prices.${customerType} must be a non-negative integer`);
  }
}

export function validateCreateProductInput(input: CreateProductInput): string[] {
  const errors: string[] = [];
  const code = input.code?.trim() ?? "";

  if (code.length === 0) {
    errors.push("code is required");
  } else {
    if (code.length > PRODUCT_CODE_MAX_LENGTH) {
      errors.push(`code must be at most ${PRODUCT_CODE_MAX_LENGTH} characters`);
    }
    if (!PRODUCT_CODE_PATTERN.test(code)) {
      errors.push("code must be uppercase letters, digits or underscore");
    }
  }

  if (!input.name || input.name.trim().length < 2) {
    errors.push("name must have at least 2 characters");
  }

  if (input.sortOrder !== undefined && !Number.isInteger(input.sortOrder)) {
    errors.push("sortOrder must be an integer");
  }

  // Se valida cada precio QUE VINO, no que hayan venido todos: la lista de
  // categorias vive en la base y este validador no la conoce. Completitud la
  // exige el servidor, que si puede nombrar las que faltan.
  if (!input.prices) {
    errors.push("prices is required");
  } else {
    for (const [customerType, amount] of Object.entries(input.prices)) {
      validateProductPrice(customerType, amount, errors);
    }
  }

  return errors;
}

export function validateUpdateProductInput(input: UpdateProductInput): string[] {
  const errors: string[] = [];

  const touched =
    input.name !== undefined ||
    input.isActive !== undefined ||
    input.sortOrder !== undefined;

  if (!touched) {
    errors.push("at least one field must be provided");
  }

  if (input.name !== undefined && input.name.trim().length < 2) {
    errors.push("name must have at least 2 characters");
  }

  if (input.isActive !== undefined && typeof input.isActive !== "boolean") {
    errors.push("isActive must be a boolean");
  }

  if (input.sortOrder !== undefined && !Number.isInteger(input.sortOrder)) {
    errors.push("sortOrder must be an integer");
  }

  return errors;
}

/**
 * Misma forma que el codigo de producto, y por la misma razon: es la clave
 * estable de la fila, la que sobrevive a cualquier renombre del `name`.
 */
const ZONE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_]*$/;
const ZONE_CODE_MAX_LENGTH = 20;

export function validateCreateZoneInput(input: CreateZoneInput): string[] {
  const errors: string[] = [];
  const code = input.code?.trim() ?? "";

  if (code.length === 0) {
    errors.push("code is required");
  } else {
    if (code.length > ZONE_CODE_MAX_LENGTH) {
      errors.push(`code must be at most ${ZONE_CODE_MAX_LENGTH} characters`);
    }
    if (!ZONE_CODE_PATTERN.test(code)) {
      errors.push("code must be uppercase letters, digits or underscore");
    }
  }

  if (!input.name || input.name.trim().length < 2) {
    errors.push("name must have at least 2 characters");
  }

  if (input.sortOrder !== undefined && !Number.isInteger(input.sortOrder)) {
    errors.push("sortOrder must be an integer");
  }

  return errors;
}

export function validateUpdateZoneInput(input: UpdateZoneInput): string[] {
  const errors: string[] = [];

  const touched =
    input.name !== undefined ||
    input.isActive !== undefined ||
    input.sortOrder !== undefined;

  if (!touched) {
    errors.push("at least one field must be provided");
  }

  if (input.name !== undefined && input.name.trim().length < 2) {
    errors.push("name must have at least 2 characters");
  }

  if (input.isActive !== undefined && typeof input.isActive !== "boolean") {
    errors.push("isActive must be a boolean");
  }

  if (input.sortOrder !== undefined && !Number.isInteger(input.sortOrder)) {
    errors.push("sortOrder must be an integer");
  }

  return errors;
}

/**
 * A diferencia del codigo de zona y del de producto, aca se aceptan
 * minusculas. Las tres categorias semilla son los valores del enum viejo
 * ('final', 'comercio', 'distribuidor'), ya persistidos en ventas encoladas y
 * por lo tanto inmutables: forzar mayusculas para las nuevas dejaria la
 * columna partida en dos convenciones para siempre.
 */
const CUSTOMER_CATEGORY_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_]*$/;

export function validateCreateCustomerCategoryInput(
  input: CreateCustomerCategoryInput,
): string[] {
  const errors: string[] = [];
  const code = input.code?.trim() ?? "";

  if (code.length === 0) {
    errors.push("code is required");
  } else {
    if (code.length > CUSTOMER_TYPE_MAX_LENGTH) {
      errors.push(`code must be at most ${CUSTOMER_TYPE_MAX_LENGTH} characters`);
    }
    if (!CUSTOMER_CATEGORY_CODE_PATTERN.test(code)) {
      errors.push("code must be letters, digits or underscore");
    }
  }

  if (!input.name || input.name.trim().length < 2) {
    errors.push("name must have at least 2 characters");
  }

  if (input.sortOrder !== undefined && !Number.isInteger(input.sortOrder)) {
    errors.push("sortOrder must be an integer");
  }

  return errors;
}

export function validateUpdateCustomerCategoryInput(
  input: UpdateCustomerCategoryInput,
): string[] {
  const errors: string[] = [];

  const touched =
    input.name !== undefined ||
    input.isActive !== undefined ||
    input.sortOrder !== undefined;

  if (!touched) {
    errors.push("at least one field must be provided");
  }

  if (input.name !== undefined && input.name.trim().length < 2) {
    errors.push("name must have at least 2 characters");
  }

  if (input.isActive !== undefined && typeof input.isActive !== "boolean") {
    errors.push("isActive must be a boolean");
  }

  if (input.sortOrder !== undefined && !Number.isInteger(input.sortOrder)) {
    errors.push("sortOrder must be an integer");
  }

  return errors;
}

/**
 * Ventana hacia atras que se acepta en `occurredAt`. Cubre de sobra el uso
 * real -- los choferes sincronizan el mismo dia -- y acota el dano de un
 * reloj mal puesto o manipulado.
 */
export const OCCURRED_AT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Resuelve cuando ocurrio realmente una venta a partir de lo que dijo el
 * dispositivo, acotandolo a una ventana creible.
 *
 * La fecha la pone el telefono porque es el unico que sabe cuando se hizo la
 * venta: el servidor solo ve el momento en que llego. Pero el telefono no es
 * confiable, y de esa fecha depende a que precio se tarifa: un reloj atrasado
 * -- por accidente o a proposito -- compraria precios viejos. Fuera de la
 * ventana, o ante cualquier cosa impareseable, se usa `now`, que es siempre
 * defendible.
 */
export function resolveOccurredAt(value: string | undefined, now: Date): Date {
  if (!value) {
    return now;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return now;
  }

  if (parsed.getTime() > now.getTime()) {
    return now;
  }

  if (now.getTime() - parsed.getTime() > OCCURRED_AT_MAX_AGE_MS) {
    return now;
  }

  return parsed;
}
