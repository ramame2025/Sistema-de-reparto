import {
  type CreateAssignmentInput,
  type CreateCustomerInput,
  type CreateSaleInput,
  type CreateTruckInput,
  type UpdatePriceInput,
  validateCreateAssignmentInput,
  validateCreateCustomerInput,
  validateCreateSaleInput,
  validateCreateTruckInput,
  validateUpdatePriceInput,
} from '@distribuidor/shared';

describe('validateCreateCustomerInput', () => {
  const base: CreateCustomerInput = {
    name: 'Kiosco Sur',
    customerType: 'final',
    zone: 'Sur',
  };

  it('accepts a valid payload with zone and no lat/lng', () => {
    expect(validateCreateCustomerInput(base)).toEqual([]);
  });

  it('accepts a valid payload with lat/lng placeholders', () => {
    const input: CreateCustomerInput = {
      ...base,
      latitude: -34.6,
      longitude: -58.4,
    };
    expect(validateCreateCustomerInput(input)).toEqual([]);
  });

  it('rejects a name shorter than 2 characters', () => {
    const errors = validateCreateCustomerInput({ ...base, name: 'K' });
    expect(errors).toContain('name must have at least 2 characters');
  });

  it('rejects an invalid customerType', () => {
    const errors = validateCreateCustomerInput({
      ...base,
      customerType: 'mayorista' as CreateCustomerInput['customerType'],
    });
    expect(errors).toContain('customerType is invalid');
  });

  it('rejects an out-of-range latitude', () => {
    const errors = validateCreateCustomerInput({ ...base, latitude: 200 });
    expect(errors).toContain('latitude must be between -90 and 90');
  });
});

describe('validateCreateTruckInput', () => {
  const base: CreateTruckInput = {
    code: 'T-01',
    plate: 'AA123BB',
    capacity: 300,
  };

  it('accepts a valid payload', () => {
    expect(validateCreateTruckInput(base)).toEqual([]);
  });

  it('rejects an empty code', () => {
    const errors = validateCreateTruckInput({ ...base, code: '' });
    expect(errors).toContain('code must have at least 1 character');
  });

  it('rejects a negative capacity', () => {
    const errors = validateCreateTruckInput({ ...base, capacity: -1 });
    expect(errors).toContain('capacity must be a non-negative integer');
  });

  it('rejects a non-integer capacity', () => {
    const errors = validateCreateTruckInput({ ...base, capacity: 1.5 });
    expect(errors).toContain('capacity must be a non-negative integer');
  });
});

describe('validateCreateAssignmentInput', () => {
  const base: CreateAssignmentInput = {
    driverId: 'driver-1',
    truckId: 'truck-1',
    startDate: '2026-01-01T00:00:00.000Z',
  };

  it('accepts a valid payload without endDate', () => {
    expect(validateCreateAssignmentInput(base)).toEqual([]);
  });

  it('accepts a valid payload with endDate after startDate', () => {
    const input: CreateAssignmentInput = {
      ...base,
      endDate: '2026-01-10T00:00:00.000Z',
    };
    expect(validateCreateAssignmentInput(input)).toEqual([]);
  });

  it('rejects a missing driverId', () => {
    const errors = validateCreateAssignmentInput({ ...base, driverId: '' });
    expect(errors).toContain('driverId is required');
  });

  it('rejects an endDate before startDate', () => {
    const errors = validateCreateAssignmentInput({
      ...base,
      endDate: '2025-12-31T00:00:00.000Z',
    });
    expect(errors).toContain('endDate must not be before startDate');
  });

  it('rejects an invalid startDate', () => {
    const errors = validateCreateAssignmentInput({
      ...base,
      startDate: 'not-a-date',
    });
    expect(errors).toContain('startDate must be a valid date');
  });
});

describe('validateUpdatePriceInput', () => {
  it('accepts a positive integer amount', () => {
    const input: UpdatePriceInput = { amount: 8500 };
    expect(validateUpdatePriceInput(input)).toEqual([]);
  });

  it('rejects a zero amount', () => {
    const errors = validateUpdatePriceInput({ amount: 0 });
    expect(errors).toContain('amount must be a positive integer');
  });

  it('rejects a non-integer amount', () => {
    const errors = validateUpdatePriceInput({ amount: 8500.5 });
    expect(errors).toContain('amount must be a positive integer');
  });
});

describe('validateCreateSaleInput (widened with optional FKs)', () => {
  const base: CreateSaleInput = {
    driverName: 'Juan',
    customerName: 'Kiosco Sur',
    customerType: 'final',
    paymentMethod: 'efectivo',
    items: [{ productCode: 'G10', quantity: 1 }],
  };

  it('accepts a payload with no customerId/truckId (unchanged behavior)', () => {
    expect(validateCreateSaleInput(base)).toEqual([]);
  });

  it('accepts a payload with valid customerId and truckId', () => {
    const input: CreateSaleInput = {
      ...base,
      customerId: 'customer-1',
      truckId: 'truck-1',
    };
    expect(validateCreateSaleInput(input)).toEqual([]);
  });

  it('rejects an empty-string customerId when provided', () => {
    const errors = validateCreateSaleInput({ ...base, customerId: '' });
    expect(errors).toContain('customerId must not be empty when provided');
  });
});
