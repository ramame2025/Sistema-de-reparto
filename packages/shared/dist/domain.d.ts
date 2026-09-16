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
/**
 * Medio de pago tal como viaja por la API. Es un string abierto, no una union
 * cerrada, por la misma razon que `CustomerType`: los medios de pago los
 * define el duenio en runtime, en la tabla `PaymentMethod`. El codigo es
 * estable e inmutable una vez creado, porque ya viaja dentro de los payloads
 * de venta encolados offline en los telefonos.
 *
 * La constante `PAYMENT_METHODS` que vivia aca se ELIMINO a proposito. Una
 * lista compilada de medios de pago pasa a mentir en cuanto se inserta la
 * primera fila nueva, y mentiria en silencio: la app seguiria ofreciendo
 * cuatro opciones fijas contra una tabla que ya tiene cinco.
 */
export type PaymentMethod = string;
/** Misma cota que `CUSTOMER_TYPE_MAX_LENGTH`, y por el mismo motivo. */
export declare const PAYMENT_METHOD_MAX_LENGTH = 20;
/**
 * Que exige un medio de pago en materia de comprobante.
 *
 * - `none`: no aplica. El efectivo no tiene nada que adjuntar.
 * - `optional`: se puede adjuntar, y si no se adjunta la venta queda marcada
 *   como pendiente en el resumen del dia (`missing-proof`).
 * - `required`: el chofer no puede guardar la venta sin el comprobante.
 *
 * Son TRES estados y no un booleano porque `optional` ya existe hoy en el
 * comportamiento real: la pantalla dice "opcional" y el resumen del dia igual
 * reclama el comprobante faltante. Un booleano obligaria a elegir cual de las
 * dos mitades conservar.
 */
export declare const PROOF_POLICIES: readonly ["none", "optional", "required"];
export type ProofPolicy = (typeof PROOF_POLICIES)[number];
/**
 * Valida la FORMA de un medio de pago, no su pertenencia a la tabla.
 *
 * Mismo criterio que `isWellFormedCustomerType`: `packages/shared` corre en el
 * telefono, que valida el payload contra el catalogo que tenga cacheado --
 * posiblemente de hace dias. Comprobar pertenencia aca rechazaria una venta
 * encolada con un medio de pago creado despues de la ultima sincronizacion, es
 * decir, perderia una venta ya cobrada. Que el medio EXISTA se verifica contra
 * la tabla, del lado del servidor.
 */
export declare function isWellFormedPaymentMethod(value: unknown): boolean;
export declare const EXPENSE_CATEGORIES: readonly ["combustible", "peaje", "comida", "mantenimiento", "varios"];
export declare const USER_ROLES: readonly ["admin", "chofer"];
export declare const ASSIGNMENT_KINDS: readonly ["titular", "cobertura"];
export declare const SALE_KINDS: readonly ["sale", "churn", "swap"];
/**
 * Por que vuelve una unidad. Es un enum y no una tabla por el mismo criterio
 * que `SaleKind`: sus valores los entiende el codigo, asi que un tercer motivo
 * es funcionalidad nueva que hay que programar, no configuracion del duenio.
 */
export declare const RETURN_REASONS: readonly ["empty", "faulty"];
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type UserRole = (typeof USER_ROLES)[number];
export type AssignmentKind = (typeof ASSIGNMENT_KINDS)[number];
export type SaleKind = (typeof SALE_KINDS)[number];
export type ReturnReason = (typeof RETURN_REASONS)[number];
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
/**
 * Una linea de lo que VUELVE de la calle. Misma forma que `SaleItemInput` y a
 * proposito sin precio: lo que entra no se cotiza. El motivo no viaja en la
 * linea sino en la lista que la contiene (`returnedItems` son vacios,
 * `swappedItems` son falladas), asi que un mismo producto puede aparecer en
 * las dos a la vez sin ambiguedad.
 */
export type SaleReturnItemInput = {
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
    /**
     * Envases vacios que el cliente devuelve. No descargan mercaderia del
     * camion: se graban como `SaleReturnItem` con motivo `empty`.
     */
    returnedItems?: SaleReturnItemInput[];
    /**
     * Cambios por falla. El numero dice DOS cosas al mismo tiempo: la unidad
     * fallada que entra y la de reemplazo que sale del camion. Es un solo campo
     * justamente para que el 1 a 1 no se pueda romper -- no hay dos numeros que
     * puedan discrepar. El servidor deriva de aca la linea de `SaleItem` con
     * `unitPrice: 0` y la de `SaleReturnItem` con motivo `faulty`.
     */
    swappedItems?: SaleReturnItemInput[];
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
    /**
     * Cuantos envases vacios volvieron y de que producto. El atajo de devolucion
     * tambien puede decirlo ahora; su ausencia deja la fila como estaba, que es
     * lo que traen las visitas ya encoladas.
     */
    returnedItems?: SaleReturnItemInput[];
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
    /**
     * `true` cuando la linea es la unidad de REEMPLAZO de un cambio por falla:
     * salio del camion sin cargo y su espejo es un `SaleReturnItem` con motivo
     * `faulty`.
     *
     * Existe porque sin ella `SaleRecord.items` devuelve lo vendido y los
     * reemplazos mezclados, y quien lee la fila no puede volver a partirlos: una
     * visita mixta -- vendio Y cambio -- deja de ser editable, porque no hay
     * forma de saber que linea va en `items` y cual se reconstruye desde
     * `swappedItems`.
     *
     * NO es un filtro de stock, y confundirlo con eso seria el error de D7 al
     * reves: un reemplazo SALIO del camion y descuenta como cualquier otra
     * linea. Lo que nunca puede vivir en `SaleItem` es lo que ENTRA, y para eso
     * esta `SaleReturnItem`.
     *
     * Opcional en el tipo, igual que `returnItems`: una venta cacheada en el
     * telefono antes de este cambio no la trae, y leerla no puede romperse por
     * eso. Su ausencia significa "no es un reemplazo", que es la verdad de toda
     * fila vieja -- los cambios no existian.
     */
    isReplacement?: boolean;
};
/**
 * Parte las lineas de una venta en las dos cosas que `SaleRecord.items` trae
 * mezcladas: lo que se VENDIO y la unidad de REEMPLAZO que salio del camion
 * sin cargo en un cambio por falla.
 *
 * Pura y compartida a proposito, igual que `deriveSaleKind`: el servidor y la
 * pantalla del chofer tienen que leer la misma fila de la misma manera. Vive
 * aca y no dentro de la pantalla porque la regla es del dominio, no de la UI.
 *
 * Una linea sin la bandera cuenta como vendida. No es un default de
 * conveniencia: ninguna fila anterior a esta columna tiene reemplazos, porque
 * los cambios no existian.
 */
export declare function splitSaleItems(items: SaleItemRecord[]): {
    soldItems: SaleItemRecord[];
    replacementItems: SaleItemRecord[];
};
/**
 * Una linea que volvio, tal como quedo grabada, con su motivo.
 */
export type SaleReturnItemRecord = SaleReturnItemInput & {
    reason: ReturnReason;
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
     * `null` para toda fila que no cobro (`kind === 'churn'` o
     * `kind === 'swap'`): no hubo pago, es el hecho de negocio real, no un dato
     * faltante. Toda fila `kind === 'sale'` sigue teniendo un `PaymentMethod`
     * valido.
     */
    paymentMethod: PaymentMethod | null;
    items: SaleItemRecord[];
    /**
     * Lo que volvio en la visita, por producto y por motivo. La API siempre lo
     * manda; es opcional en el tipo porque una venta cacheada en el telefono
     * antes de este cambio no lo trae, y leerla no puede romperse por eso.
     */
    returnItems?: SaleReturnItemRecord[];
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
 * Un medio de pago tal como lo devuelve `GET /payment-methods`.
 *
 * No hay `CreatePaymentMethodInput` ni `UpdatePaymentMethodInput`, y es
 * deliberado: en esta fase la tabla no tiene endpoints de escritura. Una mala
 * configuracion aca deja a los choferes sin poder cobrar, asi que las altas y
 * los cambios de bandera se hacen por migracion. Ver `docs/plans/
 * payment-methods-table.md`, decision D3.
 */
export type PaymentMethodRecord = {
    id: string;
    code: string;
    name: string;
    isActive: boolean;
    sortOrder: number;
    proofPolicy: ProofPolicy;
    /**
     * Si el cobro es plata fisica que el chofer tiene que rendir. Hoy NO lo lee
     * nadie: no existe arqueo ni rendicion en el sistema. Viaja igual porque
     * cambiar la FORMA de este record obliga a invalidar la cache del catalogo
     * del telefono, y esa invalidacion tiene un costo operativo real (el chofer
     * que actualiza a mitad de turno no puede vender hasta tener senal). Ver
     * decision D6 del plan.
     */
    countsAsCash: boolean;
    /**
     * Si el cliente queda debiendo la venta. Es una TERCERA pregunta, distinta
     * de las otras dos banderas: una transferencia no es plata en mano y
     * tampoco deja deuda, asi que ningun booleano existente la puede responder.
     *
     * Todo consumidor pregunta por esta bandera y NUNCA compara el `code`
     * contra 'cuenta_corriente'. Esa comparacion funcionaria hoy y seria una
     * regresion: la tabla de medios de pago nacio justamente para borrar las
     * comparaciones contra el string 'efectivo' que estaban repartidas en tres
     * apps. Con la bandera, un futuro "fiado a 30 dias" es un INSERT y ningun
     * cambio de codigo. Ver decision D2 del plan.
     */
    createsDebt: boolean;
    createdAt: string;
    updatedAt: string;
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
/**
 * De que clase es la visita, segun lo que paso en ella.
 *
 * El `kind` no se elige: se deriva. Una misma visita puede vender, recibir un
 * vacio y cambiar una fallada, y eso es UN hecho comercial y UNA fila. La
 * tabla de decision es esta, y no tiene mas ramas:
 *
 * | Que paso                                     | kind    | cobra |
 * |----------------------------------------------|---------|-------|
 * | Se vendio algo (con o sin cambios ni vacios) | `sale`  | si    |
 * | Solo se cambiaron falladas                   | `swap`  | no    |
 * | Solo volvieron envases vacios                | `churn` | no    |
 *
 * Pura y sin dependencias a proposito: la usan el servidor para decidir que
 * graba y la pantalla del chofer para saber que rotulo poner en el pie, y las
 * dos tienen que llegar siempre a la misma respuesta.
 *
 * Una visita vacia en los tres lados cae en `churn`, que es la rama que no
 * cobra; el error de "no hay nada que registrar" lo pone el validador, porque
 * derivar no es validar.
 */
export declare function deriveSaleKind(input: {
    items?: SaleItemInput[];
    returnedItems?: SaleReturnItemInput[];
    swappedItems?: SaleReturnItemInput[];
}): SaleKind;
/**
 * El segundo parametro es el catalogo de medios de pago disponible. Es
 * opcional a proposito: sin catalogo el validador se comporta exactamente
 * como antes, asi que los llamadores que todavia no lo pasan no cambian de
 * comportamiento. Es tambien la unica forma de enterarse de `createsDebt`,
 * que vive en otra tabla.
 *
 * El tercero es el `kind` que hay que dar por bueno en lugar de derivarlo del
 * payload. Solo lo usa la edicion: una fila de swap guarda sus reemplazos en
 * `items`, asi que derivar sobre un payload de edicion daria `sale` y exigiria
 * un cobro que esa fila nunca tuvo. Para la creacion no se pasa nunca -- ahi
 * el contenido es la unica fuente de verdad.
 */
export declare function validateCreateSaleInput(input: CreateSaleInput, paymentMethods?: PaymentMethodRecord[], kindOverride?: SaleKind): string[];
export declare function validateRecordEmptyVisitInput(input: RecordEmptyVisitInput): string[];
export declare function validateUpdateSaleInput(input: UpdateSaleInput, paymentMethods?: PaymentMethodRecord[]): string[];
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
