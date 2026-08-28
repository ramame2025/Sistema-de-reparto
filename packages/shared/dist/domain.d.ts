export declare const PRODUCT_CODES: readonly ["G10", "G15", "G45", "G15_AUTO"];
export type ProductCode = (typeof PRODUCT_CODES)[number];
export declare const CUSTOMER_TYPES: readonly ["final", "comercio", "distribuidor"];
export type CustomerType = (typeof CUSTOMER_TYPES)[number];
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
export type PriceTable = Record<CustomerType, Record<ProductCode, number>>;
export type SaleItemInput = {
    productCode: ProductCode;
    quantity: number;
};
export type CreateSaleInput = {
    clientGeneratedId?: string;
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
export type SaleRecord = {
    id: string;
    createdAt: string;
    status: "active" | "canceled";
    canceledAt?: string;
    cancelReason?: string;
    driverName: string;
    truckCode?: string;
    total: number;
    customerName: string;
    customerType: CustomerType;
    /**
     * `null` para una fila de churn (`kind === 'churn'`): no hubo pago, es el
     * hecho de negocio real, no un dato faltante. Toda fila `kind === 'sale'`
     * sigue teniendo un `PaymentMethod` valido.
     */
    paymentMethod: PaymentMethod | null;
    items: SaleItemInput[];
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
    zone?: string;
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
 * `zone`, `address` or the coordinate pair clears the stored value, which
 * `undefined` cannot express.
 */
export type UpdateCustomerInput = {
    name?: string;
    customerType?: CustomerType;
    zone?: string | null;
    address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    isActive?: boolean;
};
export type CustomerRecord = {
    id: string;
    name: string;
    customerType: CustomerType;
    zone?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
};
export type CreateTruckInput = {
    code: string;
    plate: string;
    capacity: number;
};
export type TruckRecord = {
    id: string;
    code: string;
    plate: string;
    capacity: number;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
};
/** Todos los campos son opcionales: se actualiza solo lo que viene. */
export type UpdateTruckInput = {
    code?: string;
    plate?: string;
    capacity?: number;
    isActive?: boolean;
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
export declare const DEFAULT_PRICE_TABLE: PriceTable;
export declare function calculateSaleTotal(customerType: CustomerType, items: SaleItemInput[], prices: PriceTable): number;
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
export declare function validateUpdateTruckInput(input: UpdateTruckInput): string[];
export declare function validateCreateAssignmentInput(input: CreateAssignmentInput): string[];
export declare function validateUpdatePriceInput(input: UpdatePriceInput): string[];
/**
 * `customerIds: []` es valido (vacia la lista del dia, Spec "An empty array
 * clears the list"): no se rechaza por vacio, solo por duplicados o campos
 * de identidad faltantes/invalidos.
 */
export declare function validateCreateDriverCustomerAssignmentInput(input: CreateDriverCustomerAssignmentInput): string[];
