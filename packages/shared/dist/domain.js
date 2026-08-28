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
export const ASSIGNMENT_KINDS = ['titular', 'cobertura'];
export const SALE_KINDS = ['sale', 'churn'];
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
    if (input.paymentProofRef !== undefined && input.paymentProofRef.trim().length === 0) {
        errors.push('paymentProofRef must not be empty when provided');
    }
    if ((input.latitude !== undefined) !== (input.longitude !== undefined)) {
        errors.push('latitude and longitude must be provided together');
    }
    if (input.latitude !== undefined &&
        (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90)) {
        errors.push('latitude must be between -90 and 90');
    }
    if (input.longitude !== undefined &&
        (!Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180)) {
        errors.push('longitude must be between -180 and 180');
    }
    return errors;
}
export function validateRecordEmptyVisitInput(input) {
    const errors = [];
    if (input.clientGeneratedId !== undefined &&
        input.clientGeneratedId.trim().length < 8) {
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
    return errors;
}
function validateSaleIdentityFields(input) {
    const errors = [];
    if (input.clientGeneratedId !== undefined &&
        input.clientGeneratedId.trim().length < 8) {
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
    return errors;
}
export function validateUpdateSaleInput(input) {
    // input.kind is a validation hint only: it tells the pure validator whether
    // to skip paymentMethod/items checks. The service re-verifies it against
    // the stored row's kind before applying any change (never trusted alone).
    const errors = input.kind === 'churn'
        ? validateSaleIdentityFields(input)
        : validateCreateSaleInput(input);
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
export function validateCreateLoadManifestInput(input) {
    const errors = [];
    if (!input.truckId || input.truckId.trim().length === 0) {
        errors.push('truckId is required');
    }
    if (!Array.isArray(input.items) || input.items.length === 0) {
        errors.push('items must include at least one product');
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
    if (input.photoRef !== undefined && input.photoRef.trim().length === 0) {
        errors.push('photoRef must not be empty when provided');
    }
    if (input.note !== undefined && input.note.trim().length === 0) {
        errors.push('note must not be empty when provided');
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
export function validateCreateUserInput(input) {
    const errors = [];
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
export function validateChangePasswordInput(input) {
    const errors = [];
    if (!input.password || input.password.length < 6) {
        errors.push('password must have at least 6 characters');
    }
    return errors;
}
const LATITUDE_ERROR = 'latitude must be between -90 and 90';
const LONGITUDE_ERROR = 'longitude must be between -180 and 180';
const COORDINATE_PAIR_ERROR = 'latitude and longitude must be provided together';
function isInvalidLatitude(value) {
    return !Number.isFinite(value) || value < -90 || value > 90;
}
function isInvalidLongitude(value) {
    return !Number.isFinite(value) || value < -180 || value > 180;
}
/**
 * Canonical form used to decide whether two customer names are "the same"
 * for duplicate detection. Accent folding is not cosmetic here: without it
 * "Don Jose" and "Don José" slip past the check on the very first try.
 */
export function normalizeCustomerName(name) {
    return name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}
export function validateCreateCustomerInput(input) {
    const errors = [];
    if (!input.name || input.name.trim().length < 2) {
        errors.push('name must have at least 2 characters');
    }
    if (!CUSTOMER_TYPES.includes(input.customerType)) {
        errors.push('customerType is invalid');
    }
    if (input.zone !== undefined && input.zone.trim().length === 0) {
        errors.push('zone must not be empty when provided');
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
export function validateUpdateCustomerInput(input) {
    const errors = [];
    const touched = input.name !== undefined ||
        input.customerType !== undefined ||
        input.zone !== undefined ||
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
    if (input.customerType !== undefined && !CUSTOMER_TYPES.includes(input.customerType)) {
        errors.push('customerType is invalid');
    }
    if (input.zone !== undefined && input.zone !== null && input.zone.trim().length === 0) {
        errors.push('zone must not be empty when provided');
    }
    if (input.address !== undefined &&
        input.address !== null &&
        input.address.trim().length === 0) {
        errors.push('address must not be empty when provided');
    }
    if (input.latitude !== undefined &&
        input.latitude !== null &&
        isInvalidLatitude(input.latitude)) {
        errors.push(LATITUDE_ERROR);
    }
    if (input.longitude !== undefined &&
        input.longitude !== null &&
        isInvalidLongitude(input.longitude)) {
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
export function validateCreateTruckInput(input) {
    const errors = [];
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
export function validateUpdateTruckInput(input) {
    const errors = [];
    const touched = input.code !== undefined ||
        input.plate !== undefined ||
        input.capacity !== undefined ||
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
    if (input.capacity !== undefined &&
        (!Number.isInteger(input.capacity) || input.capacity < 0)) {
        errors.push('capacity must be a non-negative integer');
    }
    if (input.isActive !== undefined && typeof input.isActive !== 'boolean') {
        errors.push('isActive must be a boolean');
    }
    return errors;
}
export function validateCreateAssignmentInput(input) {
    const errors = [];
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
        }
        else if (startDateValid && endDate.getTime() < startDate.getTime()) {
            errors.push('endDate must not be before startDate');
        }
    }
    return errors;
}
export function validateUpdatePriceInput(input) {
    const errors = [];
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
export function validateCreateDriverCustomerAssignmentInput(input) {
    const errors = [];
    if (!input.driverId || input.driverId.trim().length === 0) {
        errors.push('driverId is required');
    }
    if (!input.date || input.date.trim().length === 0) {
        errors.push('date is required');
    }
    else if (Number.isNaN(new Date(input.date).getTime())) {
        errors.push('date must be a valid date');
    }
    const uniqueCount = new Set(input.customerIds).size;
    if (uniqueCount !== input.customerIds.length) {
        errors.push('duplicate customerId');
    }
    return errors;
}
