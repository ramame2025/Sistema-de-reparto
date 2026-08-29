jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('../context/AuthContext', () => {
  const actual = jest.requireActual('../context/AuthContext');
  return {
    ...actual,
    useAuth: jest.fn(),
  };
});

jest.mock('../context/TruckContext', () => {
  const actual = jest.requireActual('../context/TruckContext');
  return { ...actual, useTruck: jest.fn() };
});

const mockedNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ navigate: mockedNavigate }),
  };
});

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import * as ExpoFileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { ExpensesScreen } from './ExpensesScreen';
import { useAuth } from '../context/AuthContext';
import { useTruck } from '../context/TruckContext';
import { ApiError } from '../services/apiClient';

const mockedUseAuth = useAuth as jest.Mock;
const mockedLaunchImageLibraryAsync = ImagePicker.launchImageLibraryAsync as jest.Mock;
const mockedLaunchCameraAsync = ImagePicker.launchCameraAsync as jest.Mock;
const mockedFile = ExpoFileSystem.File as unknown as jest.Mock;
// mockUpload is a manual-mock-only export not present in the real module's
// types; see __mocks__/expo-file-system.ts.
const mockUpload = (ExpoFileSystem as unknown as { mockUpload: jest.Mock }).mockUpload;

const successUpload = (url: string) => ({
  body: JSON.stringify({ url }),
  status: 200,
  headers: {},
});

let mockedApiPost: jest.Mock;
let mockedApiGet: jest.Mock;

beforeEach(() => {
  (useTruck as jest.Mock).mockReturnValue({
    truck: {
      assignmentId: 'a-1',
      kind: 'titular' as const,
      truckId: 'truck-1',
      code: 'C-04',
      plate: 'AB123CD',
      capacity: 120,
      startDate: '2026-08-01T00:00:00.000Z',
      endDate: null,
    },
    date: '2026-08-28',
    status: 'ready' as const,
    error: null,
    reload: jest.fn(),
  });
  mockedApiPost = jest.fn();
  mockedApiGet = jest.fn().mockResolvedValue([]);
  mockedFile.mockClear();
  mockUpload.mockClear();
  mockUpload.mockResolvedValue(successUpload('https://cdn.test/mock-upload.jpg'));

  mockedUseAuth.mockReturnValue({
    status: 'authenticated' as const,
    token: 'tok',
    username: 'chofer1',
    loading: false,
    api: { post: mockedApiPost, get: mockedApiGet },
    login: jest.fn(),
    logout: jest.fn(),
    requireAuthToken: jest.fn(() => 'tok'),
  });

  mockedLaunchImageLibraryAsync.mockClear();
  mockedLaunchImageLibraryAsync.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file://fake.jpg' }],
  });
  mockedLaunchCameraAsync.mockClear();
  mockedLaunchCameraAsync.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file://fake.jpg' }],
  });
  mockedNavigate.mockClear();
});

describe('ExpensesScreen/save expense', () => {
  it('submits category/amount/note via api.post and shows success feedback', async () => {
    mockedApiPost.mockResolvedValue({ id: 'exp-1' });

    await render(<ExpensesScreen />);
    await fireEvent.changeText(screen.getByTestId('expense-amount-input'), '1500');
    await fireEvent.changeText(screen.getByTestId('expense-note'), 'Nafta');
    await fireEvent.press(screen.getByTestId('sale-footer-action'));

    await waitFor(() =>
      expect(mockedApiPost).toHaveBeenCalledWith('/expenses', {
        driverName: 'chofer1',
        category: 'combustible',
        amount: 1500,
        note: 'Nafta',
        receiptRef: undefined,
      }),
    );
    expect(mockedNavigate).toHaveBeenCalledWith('ExpenseResult', {
      category: 'combustible',
      amount: 1500,
      hasReceipt: false,
    });
    // El formulario queda limpio para el gasto siguiente.
    expect(screen.getByTestId('expense-amount-input').props.value).toBe('');
  });

  it('shows distinct failure feedback when api.post rejects, without enqueueing offline', async () => {
    mockedApiPost.mockRejectedValue(new ApiError(500, 'API 500'));

    await render(<ExpensesScreen />);
    await fireEvent.changeText(screen.getByTestId('expense-amount-input'), '900');
    await fireEvent.press(screen.getByTestId('sale-footer-action'));

    await waitFor(() => expect(screen.getByText('API 500')).toBeTruthy());
    expect(screen.getByText('API 500')).toBeTruthy();
    expect(mockedNavigate).not.toHaveBeenCalled();
    // Sin cola offline, el gasto solo existe en este formulario: no puede
    // borrarse por un fallo de red.
    expect(screen.getByTestId('expense-amount-input').props.value).toBe('900');
  });

  it('will not submit without an amount, and says what is missing', async () => {
    await render(<ExpensesScreen />);

    // La guarda de validacion sigue en saveExpense; lo que cambia es que el
    // boton ya no deja llegar hasta ahi con el monto en cero.
    expect(screen.getByTestId('sale-footer-action')).toHaveTextContent('Poné el monto');
    await fireEvent.press(screen.getByTestId('sale-footer-action'));

    expect(mockedApiPost).not.toHaveBeenCalled();
    expect(mockedNavigate).not.toHaveBeenCalled();
  });

  it('carries the receipt into the payload and into the confirmation', async () => {
    mockedApiPost.mockResolvedValue({ id: 'exp-2' });
    mockUpload.mockResolvedValue(successUpload('https://cdn.test/ticket.jpg'));

    await render(<ExpensesScreen />);
    await fireEvent.press(screen.getByTestId('expense-receipt-capture'));
    await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(1));

    await fireEvent.changeText(screen.getByTestId('expense-amount-input'), '45000');
    await fireEvent.press(screen.getByTestId('sale-footer-action'));

    await waitFor(() => expect(mockedApiPost).toHaveBeenCalledTimes(1));
    expect(mockedApiPost.mock.calls[0][1].receiptRef).toBe('https://cdn.test/ticket.jpg');
    expect(mockedNavigate).toHaveBeenCalledWith('ExpenseResult', {
      category: 'combustible',
      amount: 45000,
      hasReceipt: true,
    });
  });

  it('lets a wrong photo be taken back off before saving', async () => {
    mockUpload.mockResolvedValue(successUpload('https://cdn.test/movida.jpg'));

    await render(<ExpensesScreen />);
    await fireEvent.press(screen.getByTestId('expense-receipt-capture'));
    await waitFor(() => expect(screen.getByTestId('expense-receipt-remove')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('expense-receipt-remove'));

    // Antes no habia salida: o se guardaba el gasto con la foto equivocada, o
    // se perdia lo cargado saliendo de la pantalla.
    expect(screen.queryByTestId('expense-receipt-remove')).toBeNull();
  });
});

describe('ExpensesScreen/pick receipt from gallery', () => {
  it('uploads the picked image via File.upload() and stores the resulting reference', async () => {
    mockUpload.mockResolvedValue(successUpload('https://cdn.test/receipt-1.jpg'));

    await render(<ExpensesScreen />);
    await fireEvent.press(screen.getByTestId('expense-receipt-gallery'));

    await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(1));
    // Uses expo-file-system's File.upload() (native multipart task) -- the RN
    // {uri,name,type} FormData shorthand throws "Unsupported FormDataPart
    // implementation", and rebuilding a Blob from the file's bytes throws
    // "Creating blobs from 'ArrayBuffer' ... are not supported" on this
    // RN/Expo version. File.upload() bypasses both.
    expect(mockedFile).toHaveBeenCalledWith('file://fake.jpg');
    expect(mockUpload).toHaveBeenCalledWith(
      'http://localhost:4000/uploads/receipt',
      expect.objectContaining({ fieldName: 'file', mimeType: 'image/jpeg' }),
    );
    expect(screen.getByTestId('expense-receipt-thumb').props.source).toEqual({
      uri: 'https://cdn.test/receipt-1.jpg',
    });
    expect(screen.getByText('Comprobante cargado correctamente.')).toBeTruthy();
  });

  it('does not attempt an upload when the gallery picker is canceled', async () => {
    mockedLaunchImageLibraryAsync.mockResolvedValueOnce({ canceled: true });

    await render(<ExpensesScreen />);
    await fireEvent.press(screen.getByTestId('expense-receipt-gallery'));

    await waitFor(() => expect(mockedLaunchImageLibraryAsync).toHaveBeenCalledTimes(1));
    expect(mockUpload).not.toHaveBeenCalled();
    expect(screen.queryByTestId('expense-receipt-remove')).toBeNull();
  });
});

describe('ExpensesScreen/capture receipt from camera', () => {
  it('uploads the captured image via File.upload() and stores the resulting reference', async () => {
    mockUpload.mockResolvedValue(successUpload('https://cdn.test/receipt-2.jpg'));

    await render(<ExpensesScreen />);
    await fireEvent.press(screen.getByTestId('expense-receipt-capture'));

    await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(1));
    expect(mockedFile).toHaveBeenCalledWith('file://fake.jpg');
    expect(screen.getByTestId('expense-receipt-thumb').props.source).toEqual({
      uri: 'https://cdn.test/receipt-2.jpg',
    });
    expect(screen.getByText('Comprobante capturado y cargado correctamente.')).toBeTruthy();
  });

  it('does not attempt an upload when the camera capture is canceled', async () => {
    mockedLaunchCameraAsync.mockResolvedValueOnce({ canceled: true });

    await render(<ExpensesScreen />);
    await fireEvent.press(screen.getByTestId('expense-receipt-capture'));

    await waitFor(() => expect(mockedLaunchCameraAsync).toHaveBeenCalledTimes(1));
    expect(mockUpload).not.toHaveBeenCalled();
  });
});

describe('ExpensesScreen/upload failure', () => {
  it('surfaces a distinct error state without losing retry ability when upload fails', async () => {
    mockUpload.mockRejectedValueOnce(new Error('Network request failed'));
    mockUpload.mockResolvedValueOnce(successUpload('https://cdn.test/receipt-3.jpg'));

    await render(<ExpensesScreen />);
    await fireEvent.press(screen.getByTestId('expense-receipt-gallery'));

    await waitFor(() => expect(screen.getByText('No se pudo subir el comprobante.')).toBeTruthy());
    expect(screen.queryByTestId('expense-receipt-remove')).toBeNull();
    expect(screen.getByTestId('expense-receipt-gallery').props.accessibilityState.disabled).toBe(
      false,
    );

    await fireEvent.press(screen.getByTestId('expense-receipt-gallery'));

    await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Comprobante cargado correctamente.')).toBeTruthy();
    expect(screen.getByTestId('expense-receipt-thumb').props.source).toEqual({
      uri: 'https://cdn.test/receipt-3.jpg',
    });
  });

  it('surfaces a distinct error state when the server responds with a non-2xx status', async () => {
    mockUpload.mockResolvedValueOnce({ body: 'file is required', status: 400, headers: {} });

    await render(<ExpensesScreen />);
    await fireEvent.press(screen.getByTestId('expense-receipt-gallery'));

    await waitFor(() => expect(screen.getByText('No se pudo subir el comprobante.')).toBeTruthy());
    expect(screen.queryByTestId('expense-receipt-remove')).toBeNull();
  });
});

describe('ExpensesScreen/encabezado', () => {
  it('shows the truck and what has already been spent today', async () => {
    mockedApiGet = jest.fn().mockResolvedValue([
      {
        id: 'e1',
        createdAt: new Date().toISOString(),
        driverName: 'chofer1',
        category: 'combustible',
        amount: 57100,
      },
    ]);
    mockedUseAuth.mockReturnValue({
      status: 'authenticated' as const,
      token: 'tok',
      username: 'chofer1',
      loading: false,
      api: { post: mockedApiPost, get: mockedApiGet },
      login: jest.fn(),
      logout: jest.fn(),
      requireAuthToken: jest.fn(() => 'tok'),
    });

    await render(<ExpensesScreen />);

    expect(screen.getByText('NUEVO GASTO · C-04')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByTestId('expenses-header-amount')).toHaveTextContent('$57.100'),
    );
  });

  it('still renders the form when the running total cannot be read', async () => {
    mockedApiGet = jest.fn().mockRejectedValue(new Error('sin red'));
    mockedUseAuth.mockReturnValue({
      status: 'authenticated' as const,
      token: 'tok',
      username: 'chofer1',
      loading: false,
      api: { post: mockedApiPost, get: mockedApiGet },
      login: jest.fn(),
      logout: jest.fn(),
      requireAuthToken: jest.fn(() => 'tok'),
    });

    await render(<ExpensesScreen />);

    // El total del dia es contexto, no el trabajo: que no cargue no puede
    // impedir registrar el gasto.
    await waitFor(() => expect(mockedApiGet).toHaveBeenCalled());
    expect(screen.getByTestId('expense-amount-input')).toBeTruthy();
    expect(screen.getByTestId('expenses-header-amount')).toHaveTextContent('$0');
  });
});

describe('ExpensesScreen/categoria', () => {
  it('offers every category with a readable label, not the raw code', async () => {
    await render(<ExpensesScreen />);

    expect(screen.getByText('Combustible')).toBeTruthy();
    expect(screen.getByText('Mantenimiento')).toBeTruthy();
  });

  it('sends the category the driver switched to', async () => {
    mockedApiPost.mockResolvedValue({ id: 'exp-3' });

    await render(<ExpensesScreen />);
    await fireEvent.press(screen.getByTestId('expense-category-peaje'));
    await fireEvent.changeText(screen.getByTestId('expense-amount-input'), '2300');
    await fireEvent.press(screen.getByTestId('sale-footer-action'));

    await waitFor(() => expect(mockedApiPost).toHaveBeenCalledTimes(1));
    expect(mockedApiPost.mock.calls[0][1].category).toBe('peaje');
  });
});
