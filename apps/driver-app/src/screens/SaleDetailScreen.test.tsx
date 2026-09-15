jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockUpload = jest.fn();
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({ upload: mockUpload })),
  UploadType: { MULTIPART: 'multipart' },
}));

const mockedLaunchCameraAsync = jest.fn();
const mockedRequestCameraPermissionsAsync = jest.fn();
jest.mock('expo-image-picker', () => ({
  launchCameraAsync: (...args: unknown[]) => mockedLaunchCameraAsync(...args),
  requestCameraPermissionsAsync: (...args: unknown[]) =>
    mockedRequestCameraPermissionsAsync(...args),
  MediaTypeOptions: { Images: 'Images' },
}));

jest.mock('../context/AuthContext', () => {
  const actual = jest.requireActual('../context/AuthContext');
  return { ...actual, useAuth: jest.fn() };
});

jest.mock('../context/SyncContext', () => {
  const actual = jest.requireActual('../context/SyncContext');
  return { ...actual, useSync: jest.fn() };
});

jest.mock('../context/CatalogContext', () => {
  const actual = jest.requireActual('../context/CatalogContext');
  return { ...actual, useCatalog: jest.fn() };
});

const mockedGoBack = jest.fn();
let mockedRouteSale: SaleRecord;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockedGoBack, navigate: jest.fn() }),
  useRoute: () => ({ params: { sale: mockedRouteSale } }),
}));

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import type { SaleRecord } from '@distribuidor/shared';
import { SaleDetailScreen } from './SaleDetailScreen';
import { useAuth } from '../context/AuthContext';
import { useCatalog } from '../context/CatalogContext';
import { useSync } from '../context/SyncContext';
import {
  SEED_PAYMENT_METHODS,
  buildPaymentMethod,
} from '../test-utils/paymentMethods';

const mockedUseAuth = useAuth as jest.Mock;
const mockedUseSync = useSync as jest.Mock;
let mockedApiPatch: jest.Mock;
let mockedRefreshDaySummary: jest.Mock;

const buildSale = (overrides: Partial<SaleRecord> = {}): SaleRecord => ({
  id: 's1',
  createdAt: '2026-08-20T14:30:00.000Z',
  occurredAt: '2026-08-20T14:30:00.000Z',
  status: 'active',
  driverName: 'chofer1',
  truckCode: 'C-04',
  total: 15000,
  customerName: 'Kiosco Norte',
  customerType: 'comercio',
  paymentMethod: 'transferencia',
  items: [{ productCode: 'G10', quantity: 2, unitPrice: 7500 }],
  kind: 'sale',
  ...overrides,
});

beforeEach(() => {
  mockedGoBack.mockClear();
  mockedRouteSale = buildSale();
  mockedApiPatch = jest.fn().mockResolvedValue(buildSale());
  mockedRefreshDaySummary = jest.fn().mockResolvedValue(undefined);

  (useCatalog as jest.Mock).mockReturnValue({
    paymentMethods: SEED_PAYMENT_METHODS,
  });

  mockedUseAuth.mockReturnValue({
    status: 'authenticated' as const,
    token: 'tok',
    username: 'chofer1',
    loading: false,
    api: { patch: mockedApiPatch },
    login: jest.fn(),
    logout: jest.fn(),
    requireAuthToken: jest.fn(() => 'tok'),
  });

  mockedUseSync.mockReturnValue({ refreshDaySummary: mockedRefreshDaySummary });

  mockUpload.mockReset();
  mockUpload.mockResolvedValue({
    status: 200,
    body: JSON.stringify({ url: 'https://cdn.test/nuevo.jpg' }),
    headers: {},
  });
  mockedRequestCameraPermissionsAsync.mockReset();
  mockedRequestCameraPermissionsAsync.mockResolvedValue({ granted: true });
  mockedLaunchCameraAsync.mockReset();
  mockedLaunchCameraAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file://x.jpg' }] });
});

describe('SaleDetailScreen/detail', () => {
  it('shows the customer, the truck and the recorded total', async () => {
    await render(<SaleDetailScreen />);

    expect(screen.getByText('Kiosco Norte')).toBeTruthy();
    expect(screen.getByText('Comercio')).toBeTruthy();
    expect(screen.getByTestId('sale-detail-total')).toHaveTextContent('$15.000');
    expect(screen.getByText('C-04')).toBeTruthy();
  });

  it('lists the sold items with their quantities', async () => {
    await render(<SaleDetailScreen />);

    expect(screen.getByTestId('product-row-G10-quantity')).toHaveTextContent('2');
  });

  it('labels a churn row as an empty visit and offers no item editing', async () => {
    mockedRouteSale = buildSale({ kind: 'churn', paymentMethod: null, items: [], total: 0 });
    await render(<SaleDetailScreen />);

    expect(screen.getByTestId('sale-detail-churn')).toBeTruthy();
    expect(screen.queryByTestId('sale-detail-save-button')).toBeNull();
  });
});

describe('SaleDetailScreen/cancel', () => {
  it('refuses to cancel without a reason of at least 3 characters', async () => {
    await render(<SaleDetailScreen />);

    await fireEvent.changeText(screen.getByTestId('sale-detail-cancel-reason'), 'ab');
    await fireEvent.press(screen.getByTestId('sale-detail-cancel-button'));

    await waitFor(() =>
      expect(screen.getByText('El motivo de anulacion debe tener al menos 3 caracteres.')).toBeTruthy(),
    );
    expect(mockedApiPatch).not.toHaveBeenCalled();
  });

  it('cancels the sale it was opened on, not the last one loaded in this session', async () => {
    mockedRouteSale = buildSale({ id: 'sale-abc' });
    await render(<SaleDetailScreen />);

    await fireEvent.changeText(
      screen.getByTestId('sale-detail-cancel-reason'),
      'Cliente devolvio',
    );
    await fireEvent.press(screen.getByTestId('sale-detail-cancel-button'));

    await waitFor(() =>
      expect(mockedApiPatch).toHaveBeenCalledWith('/sales/sale-abc/cancel', {
        reason: 'Cliente devolvio',
      }),
    );
  });

  it('refreshes the day summary after a successful cancel', async () => {
    await render(<SaleDetailScreen />);

    await fireEvent.changeText(screen.getByTestId('sale-detail-cancel-reason'), 'Error de carga');
    await fireEvent.press(screen.getByTestId('sale-detail-cancel-button'));

    await waitFor(() => expect(mockedRefreshDaySummary).toHaveBeenCalledTimes(1));
  });

  it('offers no actions on an already canceled sale, and shows why it was canceled', async () => {
    mockedRouteSale = buildSale({
      status: 'canceled',
      canceledAt: '2026-08-20T15:00:00.000Z',
      cancelReason: 'Cliente se arrepintio',
    });
    await render(<SaleDetailScreen />);

    expect(screen.getByText('Cliente se arrepintio')).toBeTruthy();
    expect(screen.queryByTestId('sale-detail-cancel-button')).toBeNull();
    expect(screen.queryByTestId('sale-detail-save-button')).toBeNull();
  });
});

describe('SaleDetailScreen/edit', () => {
  it('refuses to save without a reason of at least 3 characters', async () => {
    await render(<SaleDetailScreen />);

    await fireEvent.changeText(screen.getByTestId('sale-detail-edit-reason'), 'ab');
    await fireEvent.press(screen.getByTestId('sale-detail-save-button'));

    await waitFor(() =>
      expect(screen.getByText('El motivo de edicion debe tener al menos 3 caracteres.')).toBeTruthy(),
    );
    expect(mockedApiPatch).not.toHaveBeenCalled();
  });

  it('sends the edited quantities of the sale it was opened on', async () => {
    mockedRouteSale = buildSale({ id: 'sale-xyz' });
    await render(<SaleDetailScreen />);

    await fireEvent.press(screen.getByTestId('product-row-G10-increment'));
    await fireEvent.changeText(
      screen.getByTestId('sale-detail-edit-reason'),
      'Correccion de carga',
    );
    await fireEvent.press(screen.getByTestId('sale-detail-save-button'));

    await waitFor(() => expect(mockedApiPatch).toHaveBeenCalledTimes(1));
    const [path, payload] = mockedApiPatch.mock.calls[0];
    expect(path).toBe('/sales/sale-xyz');
    expect(payload.items).toEqual([{ productCode: 'G10', quantity: 3 }]);
    expect(payload.reason).toBe('Correccion de carga');
    expect(payload.customerName).toBe('Kiosco Norte');
    expect(payload.customerType).toBe('comercio');
  });

  it('drops an item taken down to zero instead of sending a zero quantity', async () => {
    mockedRouteSale = buildSale({
      items: [
        { productCode: 'G10', quantity: 1, unitPrice: 7500 },
        { productCode: 'G15', quantity: 2, unitPrice: 12600 },
      ],
    });
    await render(<SaleDetailScreen />);

    await fireEvent.press(screen.getByTestId('product-row-G10-decrement'));
    await fireEvent.changeText(screen.getByTestId('sale-detail-edit-reason'), 'Saco una');
    await fireEvent.press(screen.getByTestId('sale-detail-save-button'));

    await waitFor(() => expect(mockedApiPatch).toHaveBeenCalledTimes(1));
    expect(mockedApiPatch.mock.calls[0][1].items).toEqual([
      { productCode: 'G15', quantity: 2 },
    ]);
  });

  it('refuses to save a sale left with no items', async () => {
    mockedRouteSale = buildSale({ items: [{ productCode: 'G10', quantity: 1, unitPrice: 7500 }] });
    await render(<SaleDetailScreen />);

    await fireEvent.press(screen.getByTestId('product-row-G10-decrement'));
    await fireEvent.changeText(screen.getByTestId('sale-detail-edit-reason'), 'Vacio');
    await fireEvent.press(screen.getByTestId('sale-detail-save-button'));

    await waitFor(() =>
      expect(screen.getByText('La venta tiene que quedar con al menos un producto.')).toBeTruthy(),
    );
    expect(mockedApiPatch).not.toHaveBeenCalled();
  });

  it('sends the edited payment method', async () => {
    await render(<SaleDetailScreen />);

    await fireEvent.press(screen.getByTestId('sale-detail-payment-efectivo'));
    await fireEvent.changeText(screen.getByTestId('sale-detail-edit-reason'), 'Pago en efectivo');
    await fireEvent.press(screen.getByTestId('sale-detail-save-button'));

    await waitFor(() => expect(mockedApiPatch).toHaveBeenCalledTimes(1));
    expect(mockedApiPatch.mock.calls[0][1].paymentMethod).toBe('efectivo');
  });

  it('keeps the sale linked to its customer when editing', async () => {
    mockedRouteSale = buildSale({ customerId: 'cus-9' } as Partial<SaleRecord>);
    await render(<SaleDetailScreen />);

    await fireEvent.changeText(screen.getByTestId('sale-detail-edit-reason'), 'Correccion');
    await fireEvent.press(screen.getByTestId('sale-detail-save-button'));

    await waitFor(() => expect(mockedApiPatch).toHaveBeenCalledTimes(1));
    expect(mockedApiPatch.mock.calls[0][1].customerId).toBe('cus-9');
  });

  it('shows the running total as the driver edits, before saving', async () => {
    await render(<SaleDetailScreen />);

    expect(screen.getByTestId('sale-detail-total')).toHaveTextContent('$15.000');
    await fireEvent.press(screen.getByTestId('product-row-G10-increment'));
    expect(screen.getByTestId('sale-detail-total')).toHaveTextContent('$22.500');
  });
});

// updateSale resuelve `paymentProofRef` como `input.paymentProofRef?.trim() ||
// null` y `containerReturned` como `input.containerReturned ?? null`: lo que la
// edicion no manda, la API lo borra. Es la misma forma del agujero de
// customerId. Sin estos campos en el payload, corregir una cantidad borraba el
// comprobante de la transferencia y el envase devuelto de esa venta.
describe('SaleDetailScreen/edit preserves fields the payload would otherwise wipe', () => {
  it('sends back the payment proof of the sale being edited', async () => {
    mockedRouteSale = buildSale({ paymentProofRef: 'https://cdn.test/proof.jpg' });
    await render(<SaleDetailScreen />);

    await fireEvent.changeText(screen.getByTestId('sale-detail-edit-reason'), 'Correccion');
    await fireEvent.press(screen.getByTestId('sale-detail-save-button'));

    await waitFor(() => expect(mockedApiPatch).toHaveBeenCalledTimes(1));
    expect(mockedApiPatch.mock.calls[0][1].paymentProofRef).toBe('https://cdn.test/proof.jpg');
  });

  it('omits the payment proof entirely when the sale never had one', async () => {
    mockedRouteSale = buildSale({ paymentProofRef: undefined });
    await render(<SaleDetailScreen />);

    await fireEvent.changeText(screen.getByTestId('sale-detail-edit-reason'), 'Correccion');
    await fireEvent.press(screen.getByTestId('sale-detail-save-button'));

    await waitFor(() => expect(mockedApiPatch).toHaveBeenCalledTimes(1));
    const payload = mockedApiPatch.mock.calls[0][1];
    expect(Object.prototype.hasOwnProperty.call(payload, 'paymentProofRef')).toBe(false);
  });

  it('sends back the container-returned answer, including an explicit no', async () => {
    mockedRouteSale = buildSale({ containerReturned: false });
    await render(<SaleDetailScreen />);

    await fireEvent.changeText(screen.getByTestId('sale-detail-edit-reason'), 'Correccion');
    await fireEvent.press(screen.getByTestId('sale-detail-save-button'));

    await waitFor(() => expect(mockedApiPatch).toHaveBeenCalledTimes(1));
    // `false` es una respuesta, no una ausencia: no puede colapsar a "no preguntado".
    expect(mockedApiPatch.mock.calls[0][1].containerReturned).toBe(false);
  });

  it('leaves container-returned unasked when it was never answered', async () => {
    mockedRouteSale = buildSale({ containerReturned: undefined });
    await render(<SaleDetailScreen />);

    await fireEvent.changeText(screen.getByTestId('sale-detail-edit-reason'), 'Correccion');
    await fireEvent.press(screen.getByTestId('sale-detail-save-button'));

    await waitFor(() => expect(mockedApiPatch).toHaveBeenCalledTimes(1));
    const payload = mockedApiPatch.mock.calls[0][1];
    expect(Object.prototype.hasOwnProperty.call(payload, 'containerReturned')).toBe(false);
  });

  it('carries the note across an edit instead of dropping it', async () => {
    mockedRouteSale = buildSale({ note: 'Dejar en el porton' });
    await render(<SaleDetailScreen />);

    await fireEvent.changeText(screen.getByTestId('sale-detail-edit-reason'), 'Correccion');
    await fireEvent.press(screen.getByTestId('sale-detail-save-button'));

    await waitFor(() => expect(mockedApiPatch).toHaveBeenCalledTimes(1));
    expect(mockedApiPatch.mock.calls[0][1].note).toBe('Dejar en el porton');
  });
});

// Inicio marca como problema toda venta de hoy cobrada sin efectivo y sin
// comprobante, y manda al chofer justo aca. Sin forma de adjuntar la foto, ese
// camino terminaria en una pantalla que solo le dice el problema.
describe('SaleDetailScreen/adjuntar el comprobante que falta', () => {
  it('offers to attach a proof on a non-cash sale that has none', async () => {
    mockedRouteSale = buildSale({ paymentMethod: 'transferencia', paymentProofRef: undefined });
    await render(<SaleDetailScreen />);

    expect(screen.getByTestId('sale-detail-attach-proof')).toBeTruthy();
  });

  it('does not offer it on a cash sale, which has no proof to attach', async () => {
    mockedRouteSale = buildSale({ paymentMethod: 'efectivo' });
    await render(<SaleDetailScreen />);

    expect(screen.queryByTestId('sale-detail-attach-proof')).toBeNull();
  });

  it('does not offer it when the sale already carries its proof', async () => {
    mockedRouteSale = buildSale({
      paymentMethod: 'transferencia',
      paymentProofRef: 'https://cdn.test/ya-esta.jpg',
    });
    await render(<SaleDetailScreen />);

    expect(screen.queryByTestId('sale-detail-attach-proof')).toBeNull();
  });

  it('uploads the photo and saves it against this sale, with its own reason', async () => {
    mockedRouteSale = buildSale({
      id: 'sale-proof',
      paymentMethod: 'transferencia',
      paymentProofRef: undefined,
    });
    await render(<SaleDetailScreen />);

    await fireEvent.press(screen.getByTestId('sale-detail-attach-proof'));

    await waitFor(() => expect(mockedApiPatch).toHaveBeenCalledTimes(1));
    const [path, payload] = mockedApiPatch.mock.calls[0];
    expect(path).toBe('/sales/sale-proof');
    expect(payload.paymentProofRef).toBe('https://cdn.test/nuevo.jpg');
    // El motivo es obligatorio en el PATCH: se pone solo, el chofer no tiene
    // que escribir por que adjunta lo que faltaba.
    expect(payload.reason).toBe('Se adjunta el comprobante');
  });

  it('keeps the sale unchanged when the driver backs out of the camera', async () => {
    mockedRouteSale = buildSale({ paymentMethod: 'qr', paymentProofRef: undefined });
    mockedLaunchCameraAsync.mockResolvedValue({ canceled: true, assets: [] });

    await render(<SaleDetailScreen />);
    await fireEvent.press(screen.getByTestId('sale-detail-attach-proof'));

    await waitFor(() => expect(mockedLaunchCameraAsync).toHaveBeenCalled());
    expect(mockedApiPatch).not.toHaveBeenCalled();
  });

  it('says so and changes nothing when the upload fails', async () => {
    mockedRouteSale = buildSale({ paymentMethod: 'qr', paymentProofRef: undefined });
    mockUpload.mockResolvedValue({ status: 500, body: 'boom', headers: {} });

    await render(<SaleDetailScreen />);
    await fireEvent.press(screen.getByTestId('sale-detail-attach-proof'));

    await waitFor(() =>
      expect(screen.getByText('No se pudo subir el comprobante.')).toBeTruthy(),
    );
    expect(mockedApiPatch).not.toHaveBeenCalled();
  });
});

/**
 * Fase 2 de docs/plans/current-account-sales.md: editar una venta para
 * pasarla a un medio que genera deuda vale lo mismo que cargarla asi. La
 * regla vive en el validador compartido; esta pantalla se la pasa el catalogo
 * y traduce el motivo al idioma del chofer.
 */
describe('SaleDetailScreen/medios de pago que generan deuda', () => {
  it('refuses the edit when the sale has no directory customer, and says why in Spanish', async () => {
    mockedRouteSale = buildSale({ customerId: undefined });

    await render(<SaleDetailScreen />);
    await fireEvent.press(screen.getByTestId('sale-detail-payment-cuenta_corriente'));
    await fireEvent.changeText(
      screen.getByTestId('sale-detail-edit-reason'),
      'Pasa a cuenta',
    );
    await fireEvent.press(screen.getByTestId('sale-detail-save-button'));

    await waitFor(() =>
      expect(
        screen.getByText(
          'Cuenta corriente queda como deuda del cliente: esta venta no tiene un cliente del padrón.',
        ),
      ).toBeTruthy(),
    );
    expect(mockedApiPatch).not.toHaveBeenCalled();
    expect(
      screen.queryByText('customerId is required when the payment method creates debt'),
    ).toBeNull();
  });

  it('accepts the edit when the sale is bound to a directory customer', async () => {
    mockedRouteSale = buildSale({ customerId: 'cus-9' });

    await render(<SaleDetailScreen />);
    await fireEvent.press(screen.getByTestId('sale-detail-payment-cuenta_corriente'));
    await fireEvent.changeText(
      screen.getByTestId('sale-detail-edit-reason'),
      'Pasa a cuenta',
    );
    await fireEvent.press(screen.getByTestId('sale-detail-save-button'));

    await waitFor(() => expect(mockedApiPatch).toHaveBeenCalledTimes(1));
    expect(mockedApiPatch.mock.calls[0][1]).toMatchObject({
      paymentMethod: 'cuenta_corriente',
      customerId: 'cus-9',
    });
  });

  it('leaves an edit to a method that creates no debt untouched', async () => {
    mockedRouteSale = buildSale({ customerId: undefined });

    await render(<SaleDetailScreen />);
    await fireEvent.press(screen.getByTestId('sale-detail-payment-efectivo'));
    await fireEvent.changeText(
      screen.getByTestId('sale-detail-edit-reason'),
      'Pago en efectivo',
    );
    await fireEvent.press(screen.getByTestId('sale-detail-save-button'));

    await waitFor(() => expect(mockedApiPatch).toHaveBeenCalledTimes(1));
  });

  /** D2: la decision es la bandera, nunca el codigo. */
  it('applies the same rule to any other method flagged as creating debt', async () => {
    mockedRouteSale = buildSale({ customerId: undefined });
    (useCatalog as jest.Mock).mockReturnValue({
      paymentMethods: [
        ...SEED_PAYMENT_METHODS,
        buildPaymentMethod({
          id: 'pm-fiado-30',
          code: 'fiado_30',
          name: 'Fiado 30 días',
          sortOrder: 5,
          proofPolicy: 'none',
          countsAsCash: false,
          createsDebt: true,
        }),
      ],
    });

    await render(<SaleDetailScreen />);
    await fireEvent.press(screen.getByTestId('sale-detail-payment-fiado_30'));
    await fireEvent.changeText(
      screen.getByTestId('sale-detail-edit-reason'),
      'Pasa a fiado',
    );
    await fireEvent.press(screen.getByTestId('sale-detail-save-button'));

    await waitFor(() =>
      expect(
        screen.getByText(
          'Fiado 30 días queda como deuda del cliente: esta venta no tiene un cliente del padrón.',
        ),
      ).toBeTruthy(),
    );
    expect(mockedApiPatch).not.toHaveBeenCalled();
  });
});

/**
 * Un cambio por falla no es una venta de cero: se muestra como lo que fue, sin
 * selector de cobro, y con las cantidades de los dos lados -- lo que salio del
 * camion y lo que volvio fallado -- que son el MISMO numero (D6b).
 */
describe('SaleDetailScreen/un cambio por falla (container-swap)', () => {
  const buildSwap = (overrides: Partial<SaleRecord> = {}): SaleRecord =>
    buildSale({
      id: 'swap-1',
      kind: 'swap',
      paymentMethod: null,
      total: 0,
      items: [{ productCode: 'G10', quantity: 2, unitPrice: 0 }],
      returnItems: [{ productCode: 'G10', quantity: 2, reason: 'faulty' }],
      ...overrides,
    });

  it('says it is a swap and never offers a charge to edit', async () => {
    mockedRouteSale = buildSwap();
    await render(<SaleDetailScreen />);

    expect(screen.getByTestId('sale-detail-swap')).toBeTruthy();
    // No hubo cobro: un selector de medio de pago aca solo puede inventar uno.
    expect(screen.queryByTestId('sale-detail-payment-row')).toBeNull();
  });

  it('shows both sides of the swap: what left the truck and what came back', async () => {
    mockedRouteSale = buildSwap();
    await render(<SaleDetailScreen />);

    expect(screen.getByTestId('product-row-G10-quantity')).toHaveTextContent('2');
    expect(screen.getByTestId('faulty-row-G10-quantity')).toHaveTextContent('2');
  });

  // El 1 a 1 no se revalida: se vuelve imposible de romper. Los dos lados son
  // el mismo numero, asi que tocar cualquiera de los dos mueve los dos.
  it('moves both sides together, whichever one the driver taps', async () => {
    mockedRouteSale = buildSwap();
    await render(<SaleDetailScreen />);

    await fireEvent.press(screen.getByTestId('product-row-G10-increment'));

    expect(screen.getByTestId('product-row-G10-quantity')).toHaveTextContent('3');
    expect(screen.getByTestId('faulty-row-G10-quantity')).toHaveTextContent('3');

    await fireEvent.press(screen.getByTestId('faulty-row-G10-decrement'));

    expect(screen.getByTestId('product-row-G10-quantity')).toHaveTextContent('2');
    expect(screen.getByTestId('faulty-row-G10-quantity')).toHaveTextContent('2');
  });

  it('sends the swap as one list, so the API can keep the 1:1 on its side too', async () => {
    mockedRouteSale = buildSwap();
    await render(<SaleDetailScreen />);

    await fireEvent.press(screen.getByTestId('product-row-G10-increment'));
    await fireEvent.changeText(
      screen.getByTestId('sale-detail-edit-reason'),
      'Eran tres falladas, no dos',
    );
    await fireEvent.press(screen.getByTestId('sale-detail-save-button'));

    await waitFor(() => expect(mockedApiPatch).toHaveBeenCalledTimes(1));
    const [, payload] = mockedApiPatch.mock.calls[0];
    // `kind` viaja para que el servidor pueda rechazar una edicion que le
    // cambie la clase a la fila; el numero viaja UNA sola vez.
    expect(payload.kind).toBe('swap');
    expect(payload.swappedItems).toEqual([{ productCode: 'G10', quantity: 3 }]);
    expect(payload.items).toEqual([]);
  });

  it('never lets a swap be emptied into a row that means nothing', async () => {
    mockedRouteSale = buildSwap({
      items: [{ productCode: 'G10', quantity: 1, unitPrice: 0 }],
      returnItems: [{ productCode: 'G10', quantity: 1, reason: 'faulty' }],
    });
    await render(<SaleDetailScreen />);

    await fireEvent.press(screen.getByTestId('faulty-row-G10-decrement'));
    await fireEvent.changeText(screen.getByTestId('sale-detail-edit-reason'), 'Sin motivo real');
    await fireEvent.press(screen.getByTestId('sale-detail-save-button'));

    expect(mockedApiPatch).not.toHaveBeenCalled();
    expect(screen.getByText('El cambio tiene que quedar con al menos una unidad.')).toBeTruthy();
  });

  // Los envases vacios de la visita se muestran, pero no se editan desde aca:
  // lo que la pantalla no manda, la API no lo toca, y asi una edicion del
  // cambio no puede borrarlos sin querer.
  it('shows the empties that came back without putting them at risk', async () => {
    mockedRouteSale = buildSwap({
      returnItems: [
        { productCode: 'G10', quantity: 2, reason: 'faulty' },
        { productCode: 'G15', quantity: 1, reason: 'empty' },
      ],
    });
    await render(<SaleDetailScreen />);

    expect(screen.getByTestId('sale-detail-empties')).toBeTruthy();
    expect(screen.getByText('G15 · 1')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('sale-detail-edit-reason'), 'Otro motivo');
    await fireEvent.press(screen.getByTestId('sale-detail-save-button'));

    await waitFor(() => expect(mockedApiPatch).toHaveBeenCalledTimes(1));
    const [, payload] = mockedApiPatch.mock.calls[0];
    expect(Object.prototype.hasOwnProperty.call(payload, 'returnedItems')).toBe(false);
  });

  it('leaves a normal sale exactly as it was', async () => {
    mockedRouteSale = buildSale();
    await render(<SaleDetailScreen />);

    expect(screen.queryByTestId('sale-detail-swap')).toBeNull();
    expect(screen.getByTestId('sale-detail-payment-row')).toBeTruthy();
  });
});
