export const PRODUCT_CODES = [
  "G10",
  "G15",
  "G45",
  "G15_AUTO",
] as const;

export type ProductCode = (typeof PRODUCT_CODES)[number];

export const CUSTOMER_TYPES = ["final", "comercio", "distribuidor"] as const;

export type CustomerType = (typeof CUSTOMER_TYPES)[number];

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

export const DEFAULT_PRICE_TABLE: PriceTable = {
  final: { G10: 8500, G15: 13000, G45: 39000, G15_AUTO: 14500 },
  comercio: { G10: 8200, G15: 12600, G45: 38000, G15_AUTO: 14000 },
  distribuidor: { G10: 7900, G15: 12100, G45: 36500, G15_AUTO: 13600 },
};

export function calculateSaleTotal(
  customerType: CustomerType,
  items: SaleItemInput[],
  prices: PriceTable,
): number {
  return items.reduce((total, item) => {
    const unitPrice = prices[customerType][item.productCode] ?? 0;
    return total + unitPrice * item.quantity;
  }, 0);
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

  if (!CUSTOMER_TYPES.includes(input.customerType)) {
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
      if (!PRODUCT_CODES.includes(item.productCode)) {
        errors.push(`items[${index}].productCode is invalid`);
      }

      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        errors.push(`items[${index}].quantity must be an integer greater than 0`);
      }
    });
  }

  return errors;
}

export function validateUpdateSaleInput(input: UpdateSaleInput): string[] {
  const errors = validateCreateSaleInput(input);

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

export function validateCreateCustomerInput(input: CreateCustomerInput): string[] {
  const errors: string[] = [];

  if (!input.name || input.name.trim().length < 2) {
    errors.push('name must have at least 2 characters');
  }

  if (!CUSTOMER_TYPES.includes(input.customerType)) {
    errors.push('customerType is invalid');
  }

  if (input.zone !== undefined && input.zone.trim().length === 0) {
    errors.push('zone must not be empty when provided');
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

export function validateCreateTruckInput(input: CreateTruckInput): string[] {
  const errors: string[] = [];

  if (!input.code || input.code.trim().length < 1) {
    errors.push('code must have at least 1 character');
  }

  if (!input.plate || input.plate.trim().length < 1) {
    errors.push('plate must have at least 1 character');
  }

  if (!Number.isInteger(input.capacity) || input.capacity < 0) {
    errors.push('capacity must be a non-negative integer');
  }

  return errors;
}

export function validateCreateAssignmentInput(input: CreateAssignmentInput): string[] {
  const errors: string[] = [];

  if (!input.driverId || input.driverId.trim().length === 0) {
    errors.push('driverId is required');
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
