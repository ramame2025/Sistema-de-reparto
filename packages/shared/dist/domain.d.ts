export declare const PRODUCT_CODES: readonly ["G10", "G15", "G45", "G15_AUTO"];
export type ProductCode = (typeof PRODUCT_CODES)[number];
export declare const CUSTOMER_TYPES: readonly ["final", "comercio", "distribuidor"];
export type CustomerType = (typeof CUSTOMER_TYPES)[number];
export declare const PAYMENT_METHODS: readonly ["efectivo", "transferencia", "qr", "tarjeta"];
export declare const EXPENSE_CATEGORIES: readonly ["combustible", "peaje", "comida", "mantenimiento", "varios"];
export declare const USER_ROLES: readonly ["admin", "chofer"];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type UserRole = (typeof USER_ROLES)[number];
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
export type UserSummary = {
    id: string;
    username: string;
    role: UserRole;
    createdAt: string;
    updatedAt: string;
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
export type CreateAssignmentInput = {
    driverId: string;
    truckId: string;
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
export declare function validateLoginInput(input: LoginInput): string[];
export declare function validateCreateUserInput(input: CreateUserInput): string[];
export declare function validateChangePasswordInput(input: ChangePasswordInput): string[];
export declare function validateCreateCustomerInput(input: CreateCustomerInput): string[];
export declare function validateCreateTruckInput(input: CreateTruckInput): string[];
export declare function validateCreateAssignmentInput(input: CreateAssignmentInput): string[];
export declare function validateUpdatePriceInput(input: UpdatePriceInput): string[];
