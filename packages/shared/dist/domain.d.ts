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
export declare const PRODUCT_CODES: readonly ["G10", "G15", "G45", "G15_AUTO"];
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
export declare function isWellFormedProductCode(code: unknown): boolean;
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
export declare const CUSTOMER_TYPE_MAX_LENGTH = 20;
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
export declare function isWellFormedCustomerType(value: unknown): boolean;
export declare const PAYMENT_METHODS: readonly ["efectivo", "transferencia", "qr", "tarjeta"];
export declare const EXPENSE_CATEGORIES: readonly ["combustible", "peaje", "comida", "mantenimiento", "varios"];
export declare const USER_ROLES: readonly ["admin", "chofer"];
export declare const ASSIGNMENT_KINDS: readonly ["titular", "cobertura"];
export declare const SALE_KINDS: readonly ["sale", "churn"];
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
export type PriceTable = Partial<Record<CustomerType, Partial<Record<ProductCode, number>>>>;
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
    date: string;
    customers: CustomerRecord[];
    createdAt: string;
    updatedAt: string;
};
export type CreateDriverCustomerAssignmentInput = {
    driverId: string;
    date: string;
    customerIds: string[];
};
/** Respuesta de GET /driver-customer-assignments/me — 200 con lista vacia, nunca 404. */
export type MyAssignedCustomersResponse = {
    date: string;
    customers: CustomerRecord[];
};
/** Tamano de pagina fijo del historial de asignaciones (vista admin). */
export declare const DRIVER_CUSTOMER_ASSIGNMENT_HISTORY_PAGE_SIZE = 15;
/**
 * Filtros del historial paginado de asignaciones. Todos opcionales: sin
 * filtros devuelve la primera pagina de todo el historial, mas nuevo primero.
 * `from`/`to` son inclusivos y se comparan por dia entero (misma convencion
 * UTC-midnight que el resto del servicio). `customerId` matchea las
 * asignaciones cuya lista del dia incluye a ese cliente.
 */
export type DriverCustomerAssignmentHistoryQuery = {
    driverId?: string;
    from?: string;
    to?: string;
    customerId?: string;
    page?: number;
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
export declare const DEFAULT_PRICE_TABLE: PriceTable;
/** El par que no tiene precio, nombrado entero: sin el no se sabe que cargar. */
export type MissingPrice = {
    customerType: CustomerType;
    productCode: ProductCode;
};
export type UnitPriceResult = {
    ok: true;
    unitPrice: number;
} | {
    ok: false;
    missing: MissingPrice;
};
/**
 * La UNICA forma sancionada de leer un precio en todo el codigo.
 *
 * Existe para que "no hay precio" no se pueda confundir nunca con "el precio
 * es cero": cero es un precio real que el admin puede fijar, y un `?? 0` que
 * los mezcla vende gratis sin que nadie se entere. Devolver el par faltante,
 * y no solo un `undefined`, es lo que despues permite decir exactamente que
 * falta cargar.
 */
export declare function findUnitPrice(prices: PriceTable, customerType: CustomerType, productCode: ProductCode): UnitPriceResult;
export type PricedSaleItem = {
    productCode: ProductCode;
    quantity: number;
    unitPrice: number;
};
export type PricedSaleResult = {
    ok: true;
    items: PricedSaleItem[];
    total: number;
} | {
    ok: false;
    missing: MissingPrice[];
};
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
export declare function priceSaleItems(customerType: CustomerType, items: SaleItemInput[], prices: PriceTable): PricedSaleResult;
export declare function validateCreateSaleInput(input: CreateSaleInput): string[];
export declare function validateRecordEmptyVisitInput(input: RecordEmptyVisitInput): string[];
export declare function validateUpdateSaleInput(input: UpdateSaleInput): string[];
export declare function validateCancelSaleInput(input: CancelSaleInput): string[];
export declare function validateCreateExpenseInput(input: CreateExpenseInput): string[];
export declare function validateCreateLoadManifestInput(input: CreateLoadManifestInput): string[];
export declare function validateLoginInput(input: LoginInput): string[];
export declare function validateCreateUserInput(input: CreateUserInput): string[];
export declare function validateChangePasswordInput(input: ChangePasswordInput): string[];
/**
 * Canonical form used to decide whether two customer names are "the same"
 * for duplicate detection. Accent folding is not cosmetic here: without it
 * "Don Jose" and "Don José" slip past the check on the very first try.
 */
export declare function normalizeCustomerName(name: string): string;
export declare function validateCreateCustomerInput(input: CreateCustomerInput): string[];
export declare function validateUpdateCustomerInput(input: UpdateCustomerInput): string[];
export declare function validateCreateTruckInput(input: CreateTruckInput): string[];
/**
 * Valida la grilla de capacidad. Como en todo el paquete, de los codigos de
 * producto se comprueba la FORMA y no la pertenencia: el catalogo lo define el
 * admin en runtime y ni el telefono ni el navegador lo conocen. Que el
 * producto EXISTA lo asegura el servidor con `assertProductCodesExist`.
 */
export declare function validateSetTruckCapacitiesInput(input: SetTruckCapacitiesInput): string[];
export declare function validateUpdateTruckInput(input: UpdateTruckInput): string[];
export declare function validateCreateAssignmentInput(input: CreateAssignmentInput): string[];
export declare function validateUpdatePriceInput(input: UpdatePriceInput): string[];
/**
 * `customerIds: []` es valido (vacia la lista del dia, Spec "An empty array
 * clears the list"): no se rechaza por vacio, solo por duplicados o campos
 * de identidad faltantes/invalidos.
 */
export declare function validateCreateDriverCustomerAssignmentInput(input: CreateDriverCustomerAssignmentInput): string[];
export declare function validateCreateProductInput(input: CreateProductInput): string[];
export declare function validateUpdateProductInput(input: UpdateProductInput): string[];
export declare function validateCreateZoneInput(input: CreateZoneInput): string[];
export declare function validateUpdateZoneInput(input: UpdateZoneInput): string[];
export declare function validateCreateCustomerCategoryInput(input: CreateCustomerCategoryInput): string[];
export declare function validateUpdateCustomerCategoryInput(input: UpdateCustomerCategoryInput): string[];
/**
 * Ventana hacia atras que se acepta en `occurredAt`. Cubre de sobra el uso
 * real -- los choferes sincronizan el mismo dia -- y acota el dano de un
 * reloj mal puesto o manipulado.
 */
export declare const OCCURRED_AT_MAX_AGE_MS: number;
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
export declare function resolveOccurredAt(value: string | undefined, now: Date): Date;
