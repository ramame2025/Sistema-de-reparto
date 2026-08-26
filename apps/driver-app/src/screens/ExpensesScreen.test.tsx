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

beforeEach(() => {
  mockedApiPost = jest.fn();
  mockedFile.mockClear();
  mockUpload.mockClear();
  mockUpload.mockResolvedValue(successUpload('https://cdn.test/mock-upload.jpg'));

  mockedUseAuth.mockReturnValue({
    status: 'authenticated' as const,
    token: 'tok',
    username: 'chofer1',
    loading: false,
    api: { post: mockedApiPost },
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

describe('ExpensesScreen/history CTA', () => {
  it('navigates to ExpensesHistory when the history CTA is pressed', async () => {
    await render(<ExpensesScreen />);

    fireEvent.press(screen.getByTestId('expenses-history-cta'));

    expect(mockedNavigate).toHaveBeenCalledWith('ExpensesHistory');
  });
});

describe('ExpensesScreen/save expense', () => {
  it('submits category/amount/note via api.post and shows success feedback', async () => {
    mockedApiPost.mockResolvedValue({ id: 'exp-1' });

    await render(<ExpensesScreen />);
    await fireEvent.changeText(screen.getByTestId('expense-amount'), '1500');
    await fireEvent.changeText(screen.getByPlaceholderText('Descripcion (opcional)'), 'Nafta');
    await fireEvent.press(screen.getByTestId('expense-save-button'));

    await waitFor(() =>
      expect(mockedApiPost).toHaveBeenCalledWith('/expenses', {
        driverName: 'chofer1',
        category: 'combustible',
        amount: 1500,
        note: 'Nafta',
        receiptRef: undefined,
      }),
    );
    expect(screen.getByText('Gasto guardado correctamente.')).toBeTruthy();
    expect(screen.getByTestId('expense-amount').props.value).toBe('0');
    expect(screen.queryByTestId('expense-receipt-ref')).toBeNull();
  });

  it('shows distinct failure feedback when api.post rejects, without enqueueing offline', async () => {
    mockedApiPost.mockRejectedValue(new ApiError(500, 'API 500'));

    await render(<ExpensesScreen />);
    await fireEvent.changeText(screen.getByTestId('expense-amount'), '900');
    await fireEvent.press(screen.getByTestId('expense-save-button'));

    await waitFor(() => expect(screen.getByText('API 500')).toBeTruthy());
    expect(screen.getByText('API 500')).toBeTruthy();
    expect(screen.queryByText('Gasto guardado correctamente.')).toBeNull();
    expect(screen.getByTestId('expense-amount').props.value).toBe('900');
  });

  it('blocks submission when amount is not greater than 0', async () => {
    await render(<ExpensesScreen />);
    await fireEvent.press(screen.getByTestId('expense-save-button'));

    await waitFor(() =>
      expect(screen.getByText('El monto del gasto debe ser mayor a 0.')).toBeTruthy(),
    );
    expect(mockedApiPost).not.toHaveBeenCalled();
  });
});

describe('ExpensesScreen/pick receipt from gallery', () => {
  it('uploads the picked image via File.upload() and stores the resulting reference', async () => {
    mockUpload.mockResolvedValue(successUpload('https://cdn.test/receipt-1.jpg'));

    await render(<ExpensesScreen />);
    await fireEvent.press(screen.getByTestId('expense-pick-gallery'));

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
    expect(screen.getByTestId('expense-receipt-preview').props.source).toEqual({
      uri: 'https://cdn.test/receipt-1.jpg',
    });
    expect(screen.getByText('Comprobante cargado correctamente.')).toBeTruthy();
  });

  it('does not attempt an upload when the gallery picker is canceled', async () => {
    mockedLaunchImageLibraryAsync.mockResolvedValueOnce({ canceled: true });

    await render(<ExpensesScreen />);
    await fireEvent.press(screen.getByTestId('expense-pick-gallery'));

    await waitFor(() => expect(mockedLaunchImageLibraryAsync).toHaveBeenCalledTimes(1));
    expect(mockUpload).not.toHaveBeenCalled();
    expect(screen.queryByTestId('expense-receipt-preview')).toBeNull();
  });
});

describe('ExpensesScreen/capture receipt from camera', () => {
  it('uploads the captured image via File.upload() and stores the resulting reference', async () => {
    mockUpload.mockResolvedValue(successUpload('https://cdn.test/receipt-2.jpg'));

    await render(<ExpensesScreen />);
    await fireEvent.press(screen.getByTestId('expense-capture-camera'));

    await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(1));
    expect(mockedFile).toHaveBeenCalledWith('file://fake.jpg');
    expect(screen.getByTestId('expense-receipt-preview').props.source).toEqual({
      uri: 'https://cdn.test/receipt-2.jpg',
    });
    expect(screen.getByText('Comprobante capturado y cargado correctamente.')).toBeTruthy();
  });

  it('does not attempt an upload when the camera capture is canceled', async () => {
    mockedLaunchCameraAsync.mockResolvedValueOnce({ canceled: true });

    await render(<ExpensesScreen />);
    await fireEvent.press(screen.getByTestId('expense-capture-camera'));

    await waitFor(() => expect(mockedLaunchCameraAsync).toHaveBeenCalledTimes(1));
    expect(mockUpload).not.toHaveBeenCalled();
  });
});

describe('ExpensesScreen/upload failure', () => {
  it('surfaces a distinct error state without losing retry ability when upload fails', async () => {
    mockUpload.mockRejectedValueOnce(new Error('Network request failed'));
    mockUpload.mockResolvedValueOnce(successUpload('https://cdn.test/receipt-3.jpg'));

    await render(<ExpensesScreen />);
    await fireEvent.press(screen.getByTestId('expense-pick-gallery'));

    await waitFor(() => expect(screen.getByText('No se pudo subir el comprobante.')).toBeTruthy());
    expect(screen.queryByTestId('expense-receipt-preview')).toBeNull();
    expect(screen.getByTestId('expense-pick-gallery').props.accessibilityState.disabled).toBe(
      false,
    );

    await fireEvent.press(screen.getByTestId('expense-pick-gallery'));

    await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Comprobante cargado correctamente.')).toBeTruthy();
    expect(screen.getByTestId('expense-receipt-preview').props.source).toEqual({
      uri: 'https://cdn.test/receipt-3.jpg',
    });
  });

  it('surfaces a distinct error state when the server responds with a non-2xx status', async () => {
    mockUpload.mockResolvedValueOnce({ body: 'file is required', status: 400, headers: {} });

    await render(<ExpensesScreen />);
    await fireEvent.press(screen.getByTestId('expense-pick-gallery'));

    await waitFor(() => expect(screen.getByText('No se pudo subir el comprobante.')).toBeTruthy());
    expect(screen.queryByTestId('expense-receipt-preview')).toBeNull();
  });
});
