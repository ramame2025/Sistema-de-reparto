import {
  type CreateAssignmentInput,
  type CreateProductInput,
  type CreateCustomerInput,
  type CreateCustomerCategoryInput,
  type UpdateCustomerCategoryInput,
  type CreateZoneInput,
  type UpdateZoneInput,
  type CreateDriverCustomerAssignmentInput,
  type CreateLoadManifestInput,
  type CreateSaleInput,
  type CreateTruckInput,
  type PriceTable,
  type RecordEmptyVisitInput,
  type SaleItemInput,
  type UpdatePriceInput,
  type UpdateCustomerInput,
  type UpdateProductInput,
  type UpdateSaleInput,
  type UpdateTruckInput,
  findUnitPrice,
  priceSaleItems,
  resolveOccurredAt,
  validateCreateAssignmentInput,
  normalizeCustomerName,
  validateCreateProductInput,
  validateCreateCustomerInput,
  validateCreateCustomerCategoryInput,
  validateUpdateCustomerCategoryInput,
  validateCreateDriverCustomerAssignmentInput,
  validateCreateLoadManifestInput,
  validateCreateSaleInput,
  validateCreateTruckInput,
  validateRecordEmptyVisitInput,
  validateSetTruckCapacitiesInput,
  validateUpdatePriceInput,
  validateUpdateSaleInput,
  validateUpdateCustomerInput,
  validateUpdateProductInput,
  validateUpdateTruckInput,
  validateCreateZoneInput,
  validateUpdateZoneInput,
} from '@distribuidor/shared';

describe('validateCreateCustomerInput', () => {
  const base: CreateCustomerInput = {
    name: 'Kiosco Sur',
    customerType: 'final',
    zoneId: 'zone-sur',
  };

  it('accepts a valid payload with a zone and no lat/lng', () => {
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

  // La pertenencia al catalogo de categorias NO se puede comprobar aca:
  // `packages/shared` corre en el telefono y en el navegador, y ninguno de los
  // dos conoce la lista, que el admin define en runtime. Rechazar 'mayorista'
  // seria rechazar toda categoria nueva y legitima. La existencia se verifica
  // contra la tabla, del lado del servidor.
  it('accepts a customerType it has never heard of, as long as it is well formed', () => {
    const errors = validateCreateCustomerInput({
      ...base,
      customerType: 'mayorista' as CreateCustomerInput['customerType'],
    });
    expect(errors).toEqual([]);
  });

  it('rejects an empty or blank customerType', () => {
    for (const customerType of ['', '   ']) {
      expect(
        validateCreateCustomerInput({
          ...base,
          customerType: customerType as CreateCustomerInput['customerType'],
        }),
      ).toContain('customerType is invalid');
    }
  });

  it('rejects a customerType longer than 20 characters', () => {
    const errors = validateCreateCustomerInput({
      ...base,
      customerType: 'x'.repeat(21) as CreateCustomerInput['customerType'],
    });
    expect(errors).toContain('customerType is invalid');
  });

  it('rejects an out-of-range latitude', () => {
    const errors = validateCreateCustomerInput({ ...base, latitude: 200 });
    expect(errors).toContain('latitude must be between -90 and 90');
  });

  // La zona pasa a ser una fila de `Zone`, no texto libre: el alta viaja con
  // el id. Que exista y este activa lo decide el servidor, no este validador.
  it('accepts a payload carrying a zoneId', () => {
    expect(validateCreateCustomerInput({ ...base, zoneId: 'zone-1' })).toEqual([]);
  });

  it('rejects a zoneId that is present but blank', () => {
    expect(validateCreateCustomerInput({ ...base, zoneId: '  ' })).toContain(
      'zoneId must not be empty when provided',
    );
  });
});

describe('validateCreateCustomerInput — address', () => {
  const base: CreateCustomerInput = {
    name: 'Kiosco Sur',
    customerType: 'final',
    zoneId: 'zone-sur',
  };

  it('accepts a payload with no address at all (address is optional)', () => {
    expect(validateCreateCustomerInput(base)).toEqual([]);
  });

  it('accepts a payload carrying a street address', () => {
    const input: CreateCustomerInput = { ...base, address: 'Av. Mitre 1234' };
    expect(validateCreateCustomerInput(input)).toEqual([]);
  });

  it('rejects an address that is present but blank', () => {
    const errors = validateCreateCustomerInput({ ...base, address: '   ' });
    expect(errors).toContain('address must not be empty when provided');
  });

  it('accepts an address with no coordinates, and coordinates with no address', () => {
    expect(validateCreateCustomerInput({ ...base, address: 'Av. Mitre 1234' })).toEqual([]);
    expect(
      validateCreateCustomerInput({ ...base, latitude: -34.6, longitude: -58.4 }),
    ).toEqual([]);
  });

  it('rejects a latitude supplied without its longitude', () => {
    const errors = validateCreateCustomerInput({ ...base, latitude: -34.6 });
    expect(errors).toContain('latitude and longitude must be provided together');
  });

  it('rejects a longitude supplied without its latitude', () => {
    const errors = validateCreateCustomerInput({ ...base, longitude: -58.4 });
    expect(errors).toContain('latitude and longitude must be provided together');
  });
});

describe('validateUpdateCustomerInput', () => {
  it('accepts a patch touching a single field', () => {
    expect(validateUpdateCustomerInput({ name: 'Kiosco Norte' })).toEqual([]);
  });

  it('rejects an empty patch', () => {
    const errors = validateUpdateCustomerInput({});
    expect(errors).toContain('at least one field must be provided');
  });

  it('rejects a name shorter than 2 characters', () => {
    const errors = validateUpdateCustomerInput({ name: 'K' });
    expect(errors).toContain('name must have at least 2 characters');
  });

  it('accepts a customerType it has never heard of, as long as it is well formed', () => {
    const errors = validateUpdateCustomerInput({
      customerType: 'mayorista' as UpdateCustomerInput['customerType'],
    });
    expect(errors).toEqual([]);
  });

  it('rejects a blank customerType', () => {
    const errors = validateUpdateCustomerInput({
      customerType: '  ' as UpdateCustomerInput['customerType'],
    });
    expect(errors).toContain('customerType is invalid');
  });

  it('rejects out-of-range coordinates', () => {
    expect(
      validateUpdateCustomerInput({ latitude: 200, longitude: -58.4 }),
    ).toContain('latitude must be between -90 and 90');
    expect(
      validateUpdateCustomerInput({ latitude: -34.6, longitude: 400 }),
    ).toContain('longitude must be between -180 and 180');
  });

  // A half-set pair is the one input that would silently drop a customer out
  // of sortByProximity: the record looks located but cannot be ranked.
  it('rejects moving only one half of the coordinate pair', () => {
    expect(validateUpdateCustomerInput({ latitude: -34.6 })).toContain(
      'latitude and longitude must be provided together',
    );
    expect(validateUpdateCustomerInput({ longitude: -58.4 })).toContain(
      'latitude and longitude must be provided together',
    );
  });

  it('accepts clearing both coordinates at once with null', () => {
    expect(
      validateUpdateCustomerInput({ latitude: null, longitude: null }),
    ).toEqual([]);
  });

  it('rejects a blank address when explicitly provided', () => {
    expect(validateUpdateCustomerInput({ address: '  ' })).toContain(
      'address must not be empty when provided',
    );
  });

  it('rejects a non-boolean isActive', () => {
    const errors = validateUpdateCustomerInput({
      isActive: 'yes' as unknown as boolean,
    });
    expect(errors).toContain('isActive must be a boolean');
  });

  // Mover un cliente de zona es un patch que solo toca `zoneId`: si no
  // contara como campo tocado, el unico cambio posible seria rechazado.
  it('accepts a patch that only moves the customer to another zone', () => {
    expect(validateUpdateCustomerInput({ zoneId: 'zone-2' })).toEqual([]);
  });

  it('accepts clearing the zone with an explicit null', () => {
    expect(validateUpdateCustomerInput({ zoneId: null })).toEqual([]);
  });

  it('rejects a blank zoneId when explicitly provided', () => {
    expect(validateUpdateCustomerInput({ zoneId: '  ' })).toContain(
      'zoneId must not be empty when provided',
    );
  });
});

describe('normalizeCustomerName', () => {
  it('trims and lowercases', () => {
    expect(normalizeCustomerName('  Kiosco Sur  ')).toBe('kiosco sur');
  });

  // Without accent folding, "José" and "Jose" defeat duplicate detection on
  // the very first try (plan risk R4).
  it('folds accents so Jose and José collide', () => {
    expect(normalizeCustomerName('Don José')).toBe(normalizeCustomerName('Don Jose'));
  });

  it('collapses runs of internal whitespace', () => {
    expect(normalizeCustomerName('Kiosco   del  Sur')).toBe('kiosco del sur');
  });

  it('keeps genuinely different names apart', () => {
    expect(normalizeCustomerName('Kiosco Sur')).not.toBe(
      normalizeCustomerName('Kiosco Norte'),
    );
  });
});

describe('validateCreateTruckInput', () => {
  const base: CreateTruckInput = {
    code: 'T-01',
    plate: 'AA123BB',
  };

  it('accepts a valid payload', () => {
    expect(validateCreateTruckInput(base)).toEqual([]);
  });

  it('rejects an empty code', () => {
    const errors = validateCreateTruckInput({ ...base, code: '' });
    expect(errors).toContain('code must have at least 1 character');
  });

  it('rejects an empty plate', () => {
    const errors = validateCreateTruckInput({ ...base, plate: '   ' });
    expect(errors).toContain('plate must have at least 1 character');
  });
});

describe('validateUpdateTruckInput', () => {
  it('rejects an empty payload: un PATCH sin campos no es una actualizacion', () => {
    expect(validateUpdateTruckInput({})).toContain('at least one field must be provided');
  });

  it('accepts a partial payload with only the plate', () => {
    expect(validateUpdateTruckInput({ plate: 'AA123BB' })).toEqual([]);
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

describe('validateSetTruckCapacitiesInput', () => {
  it('accepts a grid with one row per product', () => {
    expect(
      validateSetTruckCapacitiesInput({
        capacities: [
          { productCode: 'G10', units: 30 },
          { productCode: 'G45', units: 12 },
        ],
      }),
    ).toEqual([]);
  });

  // La grilla vacia es "sin detallar": el estado con el que nace todo camion
  // despues de la migracion, y al que se vuelve borrando todas las filas.
  it('accepts an empty grid', () => {
    expect(validateSetTruckCapacitiesInput({ capacities: [] })).toEqual([]);
  });

  // 0 es una respuesta real ("este producto no viaja en este camion"), no un
  // campo ausente: si la validacion usara `if (!units)` lo rechazaria.
  it('accepts units 0 without confusing it with "campo ausente"', () => {
    expect(
      validateSetTruckCapacitiesInput({
        capacities: [{ productCode: 'G10', units: 0 }],
      }),
    ).toEqual([]);
  });

  it('rejects a capacities that is not an array', () => {
    expect(
      validateSetTruckCapacitiesInput({
        capacities: undefined as unknown as [],
      }),
    ).toContain('capacities must be an array');
  });

  it('rejects a negative or fractional units', () => {
    expect(
      validateSetTruckCapacitiesInput({
        capacities: [{ productCode: 'G10', units: -1 }],
      }),
    ).toContain('units must be a non-negative integer');
    expect(
      validateSetTruckCapacitiesInput({
        capacities: [{ productCode: 'G10', units: 1.5 }],
      }),
    ).toContain('units must be a non-negative integer');
  });

  // Forma, no pertenencia: el catalogo lo define el admin en runtime y quien
  // corre esta validacion (telefono, navegador) no lo conoce.
  it('rejects a malformed productCode', () => {
    expect(
      validateSetTruckCapacitiesInput({
        capacities: [{ productCode: '  ', units: 1 }],
      }),
    ).toContain('productCode is invalid');
  });

  // Dos filas del mismo producto no tienen respuesta: cual de las dos es la
  // capacidad? Se rechaza antes de que el unique de la base lo haga.
  it('rejects a duplicated productCode', () => {
    expect(
      validateSetTruckCapacitiesInput({
        capacities: [
          { productCode: 'G10', units: 1 },
          { productCode: 'G10', units: 2 },
        ],
      }),
    ).toContain('productCode G10 is duplicated');
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

  // Una venta encolada en el telefono trae la categoria que el cliente tenia
  // en ese momento. El telefono no conoce el catalogo de categorias, asi que
  // el validador solo mira la forma: rechazar por pertenencia perderia ventas
  // reales de una categoria creada despues de la ultima sincronizacion.
  it('accepts a customerType it has never heard of, as long as it is well formed', () => {
    expect(validateCreateSaleInput({ ...base, customerType: 'mayorista' })).toEqual(
      [],
    );
  });

  it('rejects a blank customerType', () => {
    expect(validateCreateSaleInput({ ...base, customerType: '  ' })).toContain(
      'customerType is invalid',
    );
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

  it('accepts a payload with no paymentProofRef (unchanged behavior)', () => {
    expect(validateCreateSaleInput(base)).toEqual([]);
  });

  it('accepts a non-empty paymentProofRef regardless of paymentMethod, incluso efectivo', () => {
    const input: CreateSaleInput = {
      ...base,
      paymentMethod: 'efectivo',
      paymentProofRef: 'https://example.com/uploads/receipt_123.jpg',
    };
    expect(validateCreateSaleInput(input)).toEqual([]);
  });

  it('rejects an empty/whitespace-only paymentProofRef when provided', () => {
    const errors = validateCreateSaleInput({ ...base, paymentProofRef: '   ' });
    expect(errors).toContain('paymentProofRef must not be empty when provided');
  });

  it('accepts a payload with no latitude/longitude (unchanged behavior)', () => {
    expect(validateCreateSaleInput(base)).toEqual([]);
  });

  it('accepts a valid latitude/longitude pair regardless of paymentMethod, incluso efectivo', () => {
    const input: CreateSaleInput = {
      ...base,
      paymentMethod: 'efectivo',
      latitude: -34.6037,
      longitude: -58.3816,
    };
    expect(validateCreateSaleInput(input)).toEqual([]);
  });

  it('rejects latitude provided without longitude', () => {
    const errors = validateCreateSaleInput({ ...base, latitude: -34.6037 });
    expect(errors).toContain('latitude and longitude must be provided together');
  });

  it('rejects longitude provided without latitude', () => {
    const errors = validateCreateSaleInput({ ...base, longitude: -58.3816 });
    expect(errors).toContain('latitude and longitude must be provided together');
  });

  it('rejects an out-of-range latitude', () => {
    const errors = validateCreateSaleInput({ ...base, latitude: 200, longitude: -58.3816 });
    expect(errors).toContain('latitude must be between -90 and 90');
  });

  it('rejects an out-of-range longitude', () => {
    const errors = validateCreateSaleInput({ ...base, latitude: -34.6037, longitude: -400 });
    expect(errors).toContain('longitude must be between -180 and 180');
  });
});

describe('validateCreateLoadManifestInput', () => {
  const base: CreateLoadManifestInput = {
    driverName: 'Juan',
    truckId: 'truck-1',
    items: [{ productCode: 'G10', quantity: 10 }],
  };

  it('accepts a valid payload', () => {
    expect(validateCreateLoadManifestInput(base)).toEqual([]);
  });

  it('rejects a missing truckId', () => {
    const { truckId, ...rest } = base;
    void truckId;
    const errors = validateCreateLoadManifestInput(rest as CreateLoadManifestInput);
    expect(errors).toContain('truckId is required');
  });

  it('rejects an empty truckId', () => {
    const errors = validateCreateLoadManifestInput({ ...base, truckId: '' });
    expect(errors).toContain('truckId is required');
  });

  it('rejects an empty items array', () => {
    const errors = validateCreateLoadManifestInput({ ...base, items: [] });
    expect(errors).toContain('items must include at least one product');
  });

  it('rejects an item with an invalid productCode', () => {
    const errors = validateCreateLoadManifestInput({
      ...base,
      items: [
        {
          productCode: '  ' as CreateLoadManifestInput['items'][number]['productCode'],
          quantity: 5,
        },
      ],
    });
    expect(errors).toContain('items[0].productCode is invalid');
  });

  // El catalogo lo define el admin en runtime, asi que `packages/shared` no
  // puede saber que codigos existen: valida la FORMA, y la PERTENENCIA se
  // verifica contra la tabla Product del lado del servidor. Rechazar aca un
  // codigo desconocido bloquearia todo producto nuevo.
  it('accepts a well-formed code it has never heard of', () => {
    const errors = validateCreateLoadManifestInput({
      ...base,
      items: [
        {
          productCode: 'G99' as CreateLoadManifestInput['items'][number]['productCode'],
          quantity: 5,
        },
      ],
    });
    expect(errors).toEqual([]);
  });

  it('rejects an item with a non-integer quantity', () => {
    const errors = validateCreateLoadManifestInput({
      ...base,
      items: [{ productCode: 'G10', quantity: 1.5 }],
    });
    expect(errors).toContain('items[0].quantity must be an integer greater than 0');
  });

  it('rejects an item with a zero or negative quantity', () => {
    const errors = validateCreateLoadManifestInput({
      ...base,
      items: [{ productCode: 'G10', quantity: 0 }],
    });
    expect(errors).toContain('items[0].quantity must be an integer greater than 0');
  });

  it('accepts an optional photoRef and note when provided', () => {
    const input: CreateLoadManifestInput = {
      ...base,
      photoRef: 'uploads/photo.jpg',
      note: 'carga completa',
    };
    expect(validateCreateLoadManifestInput(input)).toEqual([]);
  });

  it('rejects an empty-string photoRef when provided', () => {
    const errors = validateCreateLoadManifestInput({ ...base, photoRef: '' });
    expect(errors).toContain('photoRef must not be empty when provided');
  });

  it('rejects an empty-string note when provided', () => {
    const errors = validateCreateLoadManifestInput({ ...base, note: '' });
    expect(errors).toContain('note must not be empty when provided');
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

  it('accepts a customerType it has never heard of, as long as it is well formed', () => {
    const errors = validateRecordEmptyVisitInput({
      ...base,
      customerType: 'mayorista' as RecordEmptyVisitInput['customerType'],
    });
    expect(errors).toEqual([]);
  });

  it('rejects a blank customerType', () => {
    const errors = validateRecordEmptyVisitInput({
      ...base,
      customerType: '  ' as RecordEmptyVisitInput['customerType'],
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

describe('validateCreateDriverCustomerAssignmentInput', () => {
  const base: CreateDriverCustomerAssignmentInput = {
    driverId: 'driver-1',
    date: '2026-08-21',
    customerIds: ['customer-1', 'customer-2'],
  };

  it('accepts a valid payload', () => {
    expect(validateCreateDriverCustomerAssignmentInput(base)).toEqual([]);
  });

  it('accepts an empty customerIds array (clears the list)', () => {
    expect(
      validateCreateDriverCustomerAssignmentInput({ ...base, customerIds: [] }),
    ).toEqual([]);
  });

  it('rejects duplicate customerIds', () => {
    const errors = validateCreateDriverCustomerAssignmentInput({
      ...base,
      customerIds: ['customer-1', 'customer-1', 'customer-2'],
    });
    expect(errors).toContain('duplicate customerId');
  });

  it('rejects a missing driverId', () => {
    const errors = validateCreateDriverCustomerAssignmentInput({
      ...base,
      driverId: '',
    });
    expect(errors).toContain('driverId is required');
  });

  it('rejects a missing date', () => {
    const errors = validateCreateDriverCustomerAssignmentInput({
      ...base,
      date: '',
    });
    expect(errors).toContain('date is required');
  });

  it('rejects an invalid date', () => {
    const errors = validateCreateDriverCustomerAssignmentInput({
      ...base,
      date: 'not-a-date',
    });
    expect(errors).toContain('date must be a valid date');
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

describe('validateCreateProductInput', () => {
  const base: CreateProductInput = {
    code: 'G20',
    name: 'Garrafa 20kg',
    prices: { final: 15000, comercio: 14500, distribuidor: 14000 },
  };

  it('accepts a valid product with all three prices', () => {
    expect(validateCreateProductInput(base)).toEqual([]);
  });

  it('accepts an optional sortOrder', () => {
    expect(validateCreateProductInput({ ...base, sortOrder: 4 })).toEqual([]);
  });

  describe('code', () => {
    it('rejects an empty code', () => {
      expect(validateCreateProductInput({ ...base, code: '  ' })).toContain(
        'code is required',
      );
    });

    // The code travels inside sale payloads already queued on drivers'
    // phones, so it has to stay a plain, stable token.
    it('rejects lowercase, spaces and punctuation', () => {
      for (const code of ['g20', 'G 20', 'G-20', 'G20!']) {
        expect(validateCreateProductInput({ ...base, code })).toContain(
          'code must be uppercase letters, digits or underscore',
        );
      }
    });

    it('accepts the shapes already in use', () => {
      for (const code of ['G10', 'G15', 'G45', 'G15_AUTO']) {
        expect(validateCreateProductInput({ ...base, code })).toEqual([]);
      }
    });

    it('rejects a code longer than 20 characters', () => {
      expect(
        validateCreateProductInput({ ...base, code: 'A'.repeat(21) }),
      ).toContain('code must be at most 20 characters');
    });
  });

  describe('name', () => {
    it('rejects a name shorter than 2 characters', () => {
      expect(validateCreateProductInput({ ...base, name: 'G' })).toContain(
        'name must have at least 2 characters',
      );
    });
  });

  describe('prices', () => {
    // Completitud ya NO se decide aca. Las categorias las define el admin en
    // runtime, y este validador corre en el telefono y en el navegador, que no
    // conocen la lista: exigir "una por categoria" contra una lista fija
    // rechazaria todo producto creado despues de que el admin agregue una.
    // La regla "nace completo o no nace" vive en ProductsService, que si
    // conoce las categorias activas y puede nombrar las que faltan.
    it('accepts a product priced for only some categories', () => {
      const errors = validateCreateProductInput({
        ...base,
        prices: { final: 15000, comercio: 14500 } as CreateProductInput['prices'],
      });
      expect(errors).toEqual([]);
    });

    it('accepts prices for categories it has never heard of', () => {
      const errors = validateCreateProductInput({
        ...base,
        prices: { mayorista: 13000 } as CreateProductInput['prices'],
      });
      expect(errors).toEqual([]);
    });

    it('still rejects a bad amount inside a category it was given', () => {
      expect(
        validateCreateProductInput({
          ...base,
          prices: { mayorista: -1 } as CreateProductInput['prices'],
        }),
      ).toContain('prices.mayorista must be a non-negative integer');
    });

    it('rejects prices missing entirely', () => {
      const errors = validateCreateProductInput({
        ...base,
        prices: undefined as unknown as CreateProductInput['prices'],
      });
      expect(errors).toContain('prices is required');
    });

    it('rejects a negative or non-integer price', () => {
      expect(
        validateCreateProductInput({ ...base, prices: { ...base.prices, final: -1 } }),
      ).toContain('prices.final must be a non-negative integer');
      expect(
        validateCreateProductInput({ ...base, prices: { ...base.prices, final: 10.5 } }),
      ).toContain('prices.final must be a non-negative integer');
    });

    it('accepts a price of zero', () => {
      expect(
        validateCreateProductInput({ ...base, prices: { ...base.prices, final: 0 } }),
      ).toEqual([]);
    });
  });
});

describe('validateUpdateProductInput', () => {
  it('accepts a patch touching a single field', () => {
    expect(validateUpdateProductInput({ name: 'Garrafa 20 kilos' })).toEqual([]);
  });

  it('rejects an empty patch', () => {
    expect(validateUpdateProductInput({})).toContain(
      'at least one field must be provided',
    );
  });

  // Renaming a code would orphan the sale payloads already queued on drivers'
  // phones, so the code is not patchable at all.
  it('has no way to change the code', () => {
    const patch = { code: 'OTRO' } as unknown as UpdateProductInput;
    expect(validateUpdateProductInput(patch)).toContain(
      'at least one field must be provided',
    );
  });

  it('rejects a short name, a non-boolean isActive and a non-integer sortOrder', () => {
    expect(validateUpdateProductInput({ name: 'G' })).toContain(
      'name must have at least 2 characters',
    );
    expect(
      validateUpdateProductInput({ isActive: 'si' as unknown as boolean }),
    ).toContain('isActive must be a boolean');
    expect(validateUpdateProductInput({ sortOrder: 1.5 })).toContain(
      'sortOrder must be an integer',
    );
  });

  it('accepts deactivating a product', () => {
    expect(validateUpdateProductInput({ isActive: false })).toEqual([]);
  });
});

describe('validateCreateZoneInput', () => {
  const base: CreateZoneInput = { code: 'CENTRO', name: 'Centro' };

  it('accepts a valid zone', () => {
    expect(validateCreateZoneInput(base)).toEqual([]);
  });

  it('accepts an optional sortOrder', () => {
    expect(validateCreateZoneInput({ ...base, sortOrder: 3 })).toEqual([]);
  });

  describe('code', () => {
    it('rejects an empty code', () => {
      expect(validateCreateZoneInput({ ...base, code: '  ' })).toContain(
        'code is required',
      );
    });

    // Misma regla que el codigo de producto: es la clave estable de la zona,
    // asi que se restringe a un token plano en vez de aceptar cualquier texto.
    it('rejects lowercase, spaces and punctuation', () => {
      for (const code of ['centro', 'ZONA 1', 'ZONA-1', 'CENTRO!']) {
        expect(validateCreateZoneInput({ ...base, code })).toContain(
          'code must be uppercase letters, digits or underscore',
        );
      }
    });

    it('accepts uppercase letters, digits and underscore', () => {
      for (const code of ['CENTRO', 'ZONA_2', 'V12']) {
        expect(validateCreateZoneInput({ ...base, code })).toEqual([]);
      }
    });

    it('rejects a code longer than 20 characters', () => {
      expect(validateCreateZoneInput({ ...base, code: 'A'.repeat(21) })).toContain(
        'code must be at most 20 characters',
      );
    });
  });

  it('rejects a name shorter than 2 characters', () => {
    expect(validateCreateZoneInput({ ...base, name: 'C' })).toContain(
      'name must have at least 2 characters',
    );
  });

  it('rejects a non-integer sortOrder', () => {
    expect(validateCreateZoneInput({ ...base, sortOrder: 1.5 })).toContain(
      'sortOrder must be an integer',
    );
  });
});

describe('validateUpdateZoneInput', () => {
  it('accepts a patch touching a single field', () => {
    expect(validateUpdateZoneInput({ name: 'Centro Norte' })).toEqual([]);
  });

  it('rejects an empty patch', () => {
    expect(validateUpdateZoneInput({})).toContain(
      'at least one field must be provided',
    );
  });

  // Renombrar el codigo dejaria colgado a todo lo que ya lo referencia, asi
  // que no es un campo parcheable: un patch que solo lo trae queda vacio.
  it('has no way to change the code', () => {
    const patch = { code: 'OTRA' } as unknown as UpdateZoneInput;
    expect(validateUpdateZoneInput(patch)).toContain(
      'at least one field must be provided',
    );
  });

  it('rejects a short name, a non-boolean isActive and a non-integer sortOrder', () => {
    expect(validateUpdateZoneInput({ name: 'C' })).toContain(
      'name must have at least 2 characters',
    );
    expect(
      validateUpdateZoneInput({ isActive: 'si' as unknown as boolean }),
    ).toContain('isActive must be a boolean');
    expect(validateUpdateZoneInput({ sortOrder: 1.5 })).toContain(
      'sortOrder must be an integer',
    );
  });

  it('accepts deactivating a zone', () => {
    expect(validateUpdateZoneInput({ isActive: false })).toEqual([]);
  });
});

describe('validateCreateCustomerCategoryInput', () => {
  const base: CreateCustomerCategoryInput = { code: 'mayorista', name: 'Mayorista' };

  it('accepts a valid category', () => {
    expect(validateCreateCustomerCategoryInput(base)).toEqual([]);
  });

  it('accepts an optional sortOrder', () => {
    expect(validateCreateCustomerCategoryInput({ ...base, sortOrder: 3 })).toEqual([]);
  });

  describe('code', () => {
    it('rejects an empty code', () => {
      expect(validateCreateCustomerCategoryInput({ ...base, code: '  ' })).toContain(
        'code is required',
      );
    });

    // A diferencia de zona y producto, aca se aceptan minusculas: las tres
    // categorias semilla son 'final', 'comercio' y 'distribuidor' -- los
    // valores del enum viejo, ya persistidos en ventas encoladas -- y su
    // codigo es inmutable. Forzar mayusculas dejaria la columna partida en dos
    // convenciones para siempre.
    it('accepts the lowercase shapes already seeded', () => {
      for (const code of ['final', 'comercio', 'distribuidor']) {
        expect(validateCreateCustomerCategoryInput({ ...base, code })).toEqual([]);
      }
    });

    it('rejects spaces and punctuation', () => {
      for (const code of ['may orista', 'may-orista', 'mayorista!']) {
        expect(validateCreateCustomerCategoryInput({ ...base, code })).toContain(
          'code must be letters, digits or underscore',
        );
      }
    });

    it('rejects a code longer than 20 characters', () => {
      expect(
        validateCreateCustomerCategoryInput({ ...base, code: 'a'.repeat(21) }),
      ).toContain('code must be at most 20 characters');
    });
  });

  it('rejects a name shorter than 2 characters', () => {
    expect(validateCreateCustomerCategoryInput({ ...base, name: 'M' })).toContain(
      'name must have at least 2 characters',
    );
  });

  it('rejects a non-integer sortOrder', () => {
    expect(
      validateCreateCustomerCategoryInput({ ...base, sortOrder: 1.5 }),
    ).toContain('sortOrder must be an integer');
  });
});

describe('validateUpdateCustomerCategoryInput', () => {
  it('accepts a patch touching a single field', () => {
    expect(validateUpdateCustomerCategoryInput({ name: 'Mayorista A' })).toEqual([]);
  });

  it('rejects an empty patch', () => {
    expect(validateUpdateCustomerCategoryInput({})).toContain(
      'at least one field must be provided',
    );
  });

  // El codigo ya viaja dentro de ventas encoladas: renombrarlo las dejaria
  // apuntando a una categoria inexistente, asi que no es parcheable.
  it('has no way to change the code', () => {
    const patch = { code: 'otra' } as unknown as UpdateCustomerCategoryInput;
    expect(validateUpdateCustomerCategoryInput(patch)).toContain(
      'at least one field must be provided',
    );
  });

  it('rejects a short name, a non-boolean isActive and a non-integer sortOrder', () => {
    expect(validateUpdateCustomerCategoryInput({ name: 'M' })).toContain(
      'name must have at least 2 characters',
    );
    expect(
      validateUpdateCustomerCategoryInput({ isActive: 'si' as unknown as boolean }),
    ).toContain('isActive must be a boolean');
    expect(validateUpdateCustomerCategoryInput({ sortOrder: 1.5 })).toContain(
      'sortOrder must be an integer',
    );
  });

  it('accepts deactivating a category', () => {
    expect(validateUpdateCustomerCategoryInput({ isActive: false })).toEqual([]);
  });
});

describe('resolveOccurredAt', () => {
  const now = new Date('2026-08-27T15:00:00.000Z');

  it('falls back to now when the device sent nothing', () => {
    expect(resolveOccurredAt(undefined, now)).toEqual(now);
  });

  it('keeps a plausible timestamp from the device', () => {
    const earlier = '2026-08-27T09:30:00.000Z';
    expect(resolveOccurredAt(earlier, now)).toEqual(new Date(earlier));
  });

  // El caso corriente que justifica todo esto: una venta de las 23:50 que
  // sincroniza pasada la medianoche no puede quedar contada al dia siguiente.
  it('keeps a sale made minutes before midnight', () => {
    const justBeforeMidnight = '2026-08-27T02:50:00.000Z';
    const syncedAfter = new Date('2026-08-27T03:10:00.000Z');
    expect(resolveOccurredAt(justBeforeMidnight, syncedAfter)).toEqual(
      new Date(justBeforeMidnight),
    );
  });

  // Un reloj adelantado no puede fechar una venta en el futuro.
  it('clamps a future timestamp to now', () => {
    expect(resolveOccurredAt('2026-09-01T00:00:00.000Z', now)).toEqual(now);
  });

  // Ni un reloj atrasado, ni alguien manipulando el telefono, puede comprar
  // precios viejos fechando la venta meses atras.
  it('clamps a timestamp older than the queue window to now', () => {
    expect(resolveOccurredAt('2026-01-01T00:00:00.000Z', now)).toEqual(now);
  });

  it('accepts the oldest timestamp still inside the window', () => {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    expect(resolveOccurredAt(thirtyDaysAgo.toISOString(), now)).toEqual(thirtyDaysAgo);
  });

  it('falls back to now for anything unparseable', () => {
    for (const bad of ['', 'ayer', '2026-13-45T99:99:99Z']) {
      expect(resolveOccurredAt(bad, now)).toEqual(now);
    }
  });
});

/**
 * The price table is sparse on purpose: a customer type may exist without a
 * price for every product. These two primitives are the only sanctioned way
 * to read a price -- every `?? 0` they replace was a silent free sale.
 */
describe('findUnitPrice', () => {
  const prices: PriceTable = {
    final: { G10: 8500, G15: 13000 },
    comercio: { G10: 8200 },
  };

  it('returns the unit price of a priced pair', () => {
    expect(findUnitPrice(prices, 'final', 'G15')).toEqual({
      ok: true,
      unitPrice: 13000,
    });
  });

  it('reports the pair when the customer type has no prices at all', () => {
    expect(findUnitPrice(prices, 'distribuidor', 'G10')).toEqual({
      ok: false,
      missing: { customerType: 'distribuidor', productCode: 'G10' },
    });
  });

  it('reports the pair when the type exists but the product is not priced for it', () => {
    expect(findUnitPrice(prices, 'comercio', 'G15')).toEqual({
      ok: false,
      missing: { customerType: 'comercio', productCode: 'G15' },
    });
  });

  // Cero es un precio real que el admin puede fijar (una promocion, una
  // muestra): tiene que distinguirse de "no hay precio", que es lo que este
  // resultado existe para no confundir.
  it('treats a stored zero as a real price, not as a missing one', () => {
    expect(findUnitPrice({ final: { G10: 0 } }, 'final', 'G10')).toEqual({
      ok: true,
      unitPrice: 0,
    });
  });
});

describe('priceSaleItems', () => {
  const prices: PriceTable = {
    final: { G10: 8500, G15: 13000 },
    comercio: { G10: 8200 },
  };

  it('prices every line and derives the total from those same lines', () => {
    const items: SaleItemInput[] = [
      { productCode: 'G10', quantity: 2 },
      { productCode: 'G15', quantity: 1 },
    ];

    expect(priceSaleItems('final', items, prices)).toEqual({
      ok: true,
      items: [
        { productCode: 'G10', quantity: 2, unitPrice: 8500 },
        { productCode: 'G15', quantity: 1, unitPrice: 13000 },
      ],
      total: 30000,
    });
  });

  it('prices an empty item list as an empty sale worth zero', () => {
    expect(priceSaleItems('final', [], prices)).toEqual({
      ok: true,
      items: [],
      total: 0,
    });
  });

  it('reports the missing pair instead of pricing the line at zero', () => {
    const result = priceSaleItems('comercio', [{ productCode: 'G15', quantity: 3 }], prices);

    expect(result).toEqual({
      ok: false,
      missing: [{ customerType: 'comercio', productCode: 'G15' }],
    });
  });

  // Que el chofer/admin vea de una lo que falta cargar, no de a un precio por
  // intento de venta.
  it('reports every missing pair, not only the first one', () => {
    const result = priceSaleItems(
      'comercio',
      [
        { productCode: 'G15', quantity: 1 },
        { productCode: 'G10', quantity: 1 },
        { productCode: 'G45', quantity: 1 },
      ],
      prices,
    );

    expect(result).toEqual({
      ok: false,
      missing: [
        { customerType: 'comercio', productCode: 'G15' },
        { customerType: 'comercio', productCode: 'G45' },
      ],
    });
  });

  it('names an unpriced pair once even if the same product appears twice', () => {
    const result = priceSaleItems(
      'comercio',
      [
        { productCode: 'G15', quantity: 1 },
        { productCode: 'G15', quantity: 2 },
      ],
      prices,
    );

    expect(result).toEqual({
      ok: false,
      missing: [{ customerType: 'comercio', productCode: 'G15' }],
    });
  });

  it('reports the pairs of a customer type with no prices at all', () => {
    const result = priceSaleItems('distribuidor', [{ productCode: 'G10', quantity: 1 }], prices);

    expect(result).toEqual({
      ok: false,
      missing: [{ customerType: 'distribuidor', productCode: 'G10' }],
    });
  });
});
