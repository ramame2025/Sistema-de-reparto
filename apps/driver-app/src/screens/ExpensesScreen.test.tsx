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

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { ExpensesScreen } from './ExpensesScreen';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../services/apiClient';

const mockedUseAuth = useAuth as jest.Mock;
const mockedLaunchImageLibraryAsync = ImagePicker.launchImageLibraryAsync as jest.Mock;
const mockedLaunchCameraAsync = ImagePicker.launchCameraAsync as jest.Mock;

let mockedApiPost: jest.Mock;
let mockedApiPostForm: jest.Mock;

beforeEach(() => {
  mockedApiPost = jest.fn();
  mockedApiPostForm = jest.fn();

  mockedUseAuth.mockReturnValue({
    status: 'authenticated' as const,
    token: 'tok',
    username: 'chofer1',
    loading: false,
    api: { post: mockedApiPost, postForm: mockedApiPostForm },
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
  it('uploads the picked image via api.postForm and stores the resulting reference', async () => {
    mockedApiPostForm.mockResolvedValue({ url: 'https://cdn.test/receipt-1.jpg' });

    await render(<ExpensesScreen />);
    await fireEvent.press(screen.getByTestId('expense-pick-gallery'));

    await waitFor(() => expect(mockedApiPostForm).toHaveBeenCalledTimes(1));
    expect(mockedApiPostForm).toHaveBeenCalledWith('/uploads/receipt', expect.any(FormData));
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
    expect(mockedApiPostForm).not.toHaveBeenCalled();
    expect(screen.queryByTestId('expense-receipt-preview')).toBeNull();
  });
});

describe('ExpensesScreen/capture receipt from camera', () => {
  it('uploads the captured image via api.postForm and stores the resulting reference', async () => {
    mockedApiPostForm.mockResolvedValue({ url: 'https://cdn.test/receipt-2.jpg' });

    await render(<ExpensesScreen />);
    await fireEvent.press(screen.getByTestId('expense-capture-camera'));

    await waitFor(() => expect(mockedApiPostForm).toHaveBeenCalledTimes(1));
    expect(mockedApiPostForm).toHaveBeenCalledWith('/uploads/receipt', expect.any(FormData));
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
    expect(mockedApiPostForm).not.toHaveBeenCalled();
  });
});

describe('ExpensesScreen/upload failure', () => {
  it('surfaces a distinct error state without losing retry ability when upload fails', async () => {
    mockedApiPostForm.mockRejectedValueOnce(new Error('Network request failed'));
    mockedApiPostForm.mockResolvedValueOnce({ url: 'https://cdn.test/receipt-3.jpg' });

    await render(<ExpensesScreen />);
    await fireEvent.press(screen.getByTestId('expense-pick-gallery'));

    await waitFor(() => expect(screen.getByText('No se pudo subir el comprobante.')).toBeTruthy());
    expect(screen.queryByTestId('expense-receipt-preview')).toBeNull();
    expect(screen.getByTestId('expense-pick-gallery').props.accessibilityState.disabled).toBe(
      false,
    );

    await fireEvent.press(screen.getByTestId('expense-pick-gallery'));

    await waitFor(() => expect(mockedApiPostForm).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Comprobante cargado correctamente.')).toBeTruthy();
    expect(screen.getByTestId('expense-receipt-preview').props.source).toEqual({
      uri: 'https://cdn.test/receipt-3.jpg',
    });
  });
});
