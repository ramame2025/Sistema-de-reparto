export const PRODUCT_CODES = [
    "G10",
    "G15",
    "G45",
    "G15_AUTO",
];
export const CUSTOMER_TYPES = ["final", "comercio", "distribuidor"];
export const PAYMENT_METHODS = [
    "efectivo",
    "transferencia",
    "qr",
    "tarjeta",
];
export const EXPENSE_CATEGORIES = [
    'combustible',
    'peaje',
    'comida',
    'mantenimiento',
    'varios',
];
export const USER_ROLES = ['admin', 'chofer'];
export const DEFAULT_PRICE_TABLE = {
    final: { G10: 8500, G15: 13000, G45: 39000, G15_AUTO: 14500 },
    comercio: { G10: 8200, G15: 12600, G45: 38000, G15_AUTO: 14000 },
    distribuidor: { G10: 7900, G15: 12100, G45: 36500, G15_AUTO: 13600 },
};
export function calculateSaleTotal(customerType, items, prices) {
    return items.reduce((total, item) => {
        const unitPrice = prices[customerType][item.productCode] ?? 0;
        return total + unitPrice * item.quantity;
    }, 0);
}
export function validateCreateSaleInput(input) {
    const errors = [];
    if (input.clientGeneratedId !== undefined &&
        input.clientGeneratedId.trim().length < 8) {
        errors.push('clientGeneratedId must have at least 8 characters when provided');
    }
    if (!input.customerName || input.customerName.trim().length < 2) {
        errors.push("customerName must have at least 2 characters");
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
export function validateUpdateSaleInput(input) {
    const errors = validateCreateSaleInput(input);
    if (!input.reason || input.reason.trim().length < 3) {
        errors.push('reason must have at least 3 characters');
    }
    return errors;
}
export function validateCancelSaleInput(input) {
    const errors = [];
    if (!input.reason || input.reason.trim().length < 3) {
        errors.push('reason must have at least 3 characters');
    }
    return errors;
}
export function validateCreateExpenseInput(input) {
    const errors = [];
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
export function validateLoginInput(input) {
    const errors = [];
    if (!input.username || input.username.trim().length < 2) {
        errors.push('username must have at least 2 characters');
    }
    if (!input.password || input.password.length < 4) {
        errors.push('password must have at least 4 characters');
    }
    return errors;
}
