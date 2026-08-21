import {
  type CreateAssignmentInput,
  type CreateCustomerInput,
  type CreateSaleInput,
  type CreateTruckInput,
  type RecordEmptyVisitInput,
  type UpdatePriceInput,
  type UpdateSaleInput,
  type UpdateTruckInput,
  validateCreateAssignmentInput,
  validateCreateCustomerInput,
  validateCreateSaleInput,
  validateCreateTruckInput,
  validateRecordEmptyVisitInput,
  validateUpdatePriceInput,
  validateUpdateSaleInput,
  validateUpdateTruckInput,
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

describe('validateUpdateTruckInput', () => {
  it('rejects an empty payload: un PATCH sin campos no es una actualizacion', () => {
    expect(validateUpdateTruckInput({})).toContain('at least one field must be provided');
  });

  it('accepts a partial payload with only the capacity', () => {
    expect(validateUpdateTruckInput({ capacity: 45 })).toEqual([]);
  });

  it('accepts capacity 0 without confusing it with "campo ausente"', () => {
    // 0 es falsy: si la validacion usara `if (!input.capacity)` lo rechazaria.
    expect(validateUpdateTruckInput({ capacity: 0 })).toEqual([]);
  });

  it('rejects a negative or fractional capacity', () => {
    expect(validateUpdateTruckInput({ capacity: -1 })).toContain(
      'capacity must be a non-negative integer',
    );
    expect(validateUpdateTruckInput({ capacity: 1.5 })).toContain(
      'capacity must be a non-negative integer',
    );
  });

  it('accepts isActive false without treating it as absent', () => {
    expect(validateUpdateTruckInput({ isActive: false })).toEqual([]);
  });

  it('rejects a blank code or plate when explicitly provided', () => {
    expect(validateUpdateTruckInput({ code: '  ' })).toContain(
      'code must have at least 1 character',
    );
    expect(validateUpdateTruckInput({ plate: '' })).toContain(
      'plate must have at least 1 character',
    );
  });
});

describe('validateCreateAssignmentInput', () => {
  const base: CreateAssignmentInput = {
    driverId: 'driver-1',
    truckId: 'truck-1',
    kind: 'titular',
    startDate: '2026-01-01T00:00:00.000Z',
  };

  it('accepts a valid payload without endDate', () => {
    expect(validateCreateAssignmentInput(base)).toEqual([]);
  });

  it('rejects an unknown kind', () => {
    const errors = validateCreateAssignmentInput({
      ...base,
      kind: 'suplente' as CreateAssignmentInput['kind'],
    });
    expect(errors).toContain('kind must be one of: titular, cobertura');
  });

  it('rejects a cobertura without endDate', () => {
    // Una cobertura sin fin no seria una cobertura: seria un cambio de titular.
    // El rango es lo que la vuelve una cobertura y lo que hace valida la regla
    // de override.
    const errors = validateCreateAssignmentInput({
      ...base,
      kind: 'cobertura',
    });
    expect(errors).toContain('endDate is required for a cobertura assignment');
  });

  it('accepts a cobertura with a closed range', () => {
    expect(
      validateCreateAssignmentInput({
        ...base,
        kind: 'cobertura',
        startDate: '2026-02-10T00:00:00.000Z',
        endDate: '2026-02-12T00:00:00.000Z',
      }),
    ).toEqual([]);
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

describe('validateRecordEmptyVisitInput', () => {
  const base: RecordEmptyVisitInput = {
    driverName: 'Juan',
    customerName: 'Kiosco Sur',
    customerType: 'final',
  };

  it('accepts a valid payload with no items and no paymentMethod', () => {
    expect(validateRecordEmptyVisitInput(base)).toEqual([]);
  });

  it('accepts a valid payload with optional customerId/truckId/truckCode/note', () => {
    const input: RecordEmptyVisitInput = {
      ...base,
      customerId: 'customer-1',
      truckId: 'truck-1',
      truckCode: 'T-01',
      note: 'no habia stock',
    };
    expect(validateRecordEmptyVisitInput(input)).toEqual([]);
  });

  it('rejects a customerName shorter than 2 characters', () => {
    const errors = validateRecordEmptyVisitInput({ ...base, customerName: 'K' });
    expect(errors).toContain('customerName must have at least 2 characters');
  });

  it('rejects a driverName shorter than 2 characters', () => {
    const errors = validateRecordEmptyVisitInput({ ...base, driverName: 'J' });
    expect(errors).toContain('driverName must have at least 2 characters');
  });

  it('rejects an invalid customerType', () => {
    const errors = validateRecordEmptyVisitInput({
      ...base,
      customerType: 'mayorista' as RecordEmptyVisitInput['customerType'],
    });
    expect(errors).toContain('customerType is invalid');
  });

  it('rejects an empty-string customerId when provided', () => {
    const errors = validateRecordEmptyVisitInput({ ...base, customerId: '' });
    expect(errors).toContain('customerId must not be empty when provided');
  });

  it('rejects an empty-string truckId when provided', () => {
    const errors = validateRecordEmptyVisitInput({ ...base, truckId: '' });
    expect(errors).toContain('truckId must not be empty when provided');
  });

  it('rejects a truckCode shorter than 2 characters when provided', () => {
    const errors = validateRecordEmptyVisitInput({ ...base, truckCode: 'T' });
    expect(errors).toContain('truckCode must have at least 2 characters when provided');
  });

  it('rejects a clientGeneratedId shorter than 8 characters when provided', () => {
    const errors = validateRecordEmptyVisitInput({ ...base, clientGeneratedId: 'short' });
    expect(errors).toContain(
      'clientGeneratedId must have at least 8 characters when provided',
    );
  });

  it('does not require paymentMethod or items (fields do not exist on this input)', () => {
    // RecordEmptyVisitInput has no items/paymentMethod fields at all; the validator
    // must never produce their error messages for a payload that only has identity fields.
    const errors = validateRecordEmptyVisitInput(base);
    expect(errors).not.toContain('paymentMethod is invalid');
    expect(errors).not.toContain('items must include at least one product');
  });
});

describe('validateUpdateSaleInput', () => {
  const base: UpdateSaleInput = {
    driverName: 'Juan',
    customerName: 'Kiosco Sur',
    customerType: 'final',
    paymentMethod: 'efectivo',
    items: [{ productCode: 'G10', quantity: 1 }],
    reason: 'ajuste de cantidad',
  };

  it('accepts a valid normal-sale update payload (kind omitted)', () => {
    expect(validateUpdateSaleInput(base)).toEqual([]);
  });

  it('accepts a valid normal-sale update payload with kind explicitly "sale"', () => {
    expect(validateUpdateSaleInput({ ...base, kind: 'sale' })).toEqual([]);
  });

  it('rejects a normal-sale update with no items (kind omitted, unchanged behavior)', () => {
    const errors = validateUpdateSaleInput({ ...base, items: [] });
    expect(errors).toContain('items must include at least one product');
  });

  it('rejects a normal-sale update with no paymentMethod (kind omitted, unchanged behavior)', () => {
    const { paymentMethod, ...rest } = base;
    const errors = validateUpdateSaleInput(rest as UpdateSaleInput);
    expect(errors).toContain('paymentMethod is invalid');
  });

  it('rejects a normal-sale update with no items even when kind is explicitly "sale"', () => {
    const errors = validateUpdateSaleInput({ ...base, kind: 'sale', items: [] });
    expect(errors).toContain('items must include at least one product');
  });

  it('accepts a churn-row update with no items and no paymentMethod when kind is "churn"', () => {
    // A real churn PATCH from the client never includes paymentMethod/items at
    // all (RecordEmptyVisitInput doesn't have them); simulate that with
    // `unknown` since UpdateSaleInput's TS shape still requires the fields
    // (see UpdateSaleInput.kind docs) -- only the runtime validator branches.
    const { paymentMethod, items, ...rest } = base;
    const input = {
      ...rest,
      items: [],
      kind: 'churn',
    } as unknown as UpdateSaleInput;
    expect(validateUpdateSaleInput(input)).toEqual([]);
  });

  it('still validates identity fields on a churn-row update', () => {
    const { paymentMethod, items, ...rest } = base;
    const input = {
      ...rest,
      items: [],
      kind: 'churn',
      customerName: 'K',
    } as unknown as UpdateSaleInput;
    const errors = validateUpdateSaleInput(input);
    expect(errors).toContain('customerName must have at least 2 characters');
  });

  it('still requires reason regardless of kind', () => {
    const errors = validateUpdateSaleInput({ ...base, kind: 'churn', items: [], reason: '' });
    expect(errors).toContain('reason must have at least 3 characters');
  });
});
