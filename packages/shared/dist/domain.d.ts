export declare const PRODUCT_CODES: readonly ["G10", "G15", "G45", "G15_AUTO"];
export type ProductCode = (typeof PRODUCT_CODES)[number];
export declare const CUSTOMER_TYPES: readonly ["final", "comercio", "distribuidor"];
export type CustomerType = (typeof CUSTOMER_TYPES)[number];
export declare const PAYMENT_METHODS: readonly ["efectivo", "transferencia", "qr", "tarjeta"];
export declare const EXPENSE_CATEGORIES: readonly ["combustible", "peaje", "comida", "mantenimiento", "varios"];
export declare const USER_ROLES: readonly ["admin", "chofer"];
export declare const ASSIGNMENT_KINDS: readonly ["titular", "cobertura"];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type UserRole = (typeof USER_ROLES)[number];
export type AssignmentKind = (typeof ASSIGNMENT_KINDS)[number];
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
};
export type UpdateSaleInput = CreateSaleInput & {
    reason: string;
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
    paymentMethod: PaymentMethod;
    items: SaleItemInput[];
    note?: string;
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
    latitude?: number;
    longitude?: number;
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
export declare const DEFAULT_PRICE_TABLE: PriceTable;
export declare function calculateSaleTotal(customerType: CustomerType, items: SaleItemInput[], prices: PriceTable): number;
export declare function validateCreateSaleInput(input: CreateSaleInput): string[];
export declare function validateUpdateSaleInput(input: UpdateSaleInput): string[];
export declare function validateCancelSaleInput(input: CancelSaleInput): string[];
export declare function validateCreateExpenseInput(input: CreateExpenseInput): string[];
export declare function validateCreateLoadManifestInput(input: CreateLoadManifestInput): string[];
export declare function validateLoginInput(input: LoginInput): string[];
export declare function validateCreateUserInput(input: CreateUserInput): string[];
export declare function validateChangePasswordInput(input: ChangePasswordInput): string[];
export declare function validateCreateCustomerInput(input: CreateCustomerInput): string[];
export declare function validateCreateTruckInput(input: CreateTruckInput): string[];
export declare function validateUpdateTruckInput(input: UpdateTruckInput): string[];
export declare function validateCreateAssignmentInput(input: CreateAssignmentInput): string[];
export declare function validateUpdatePriceInput(input: UpdatePriceInput): string[];
