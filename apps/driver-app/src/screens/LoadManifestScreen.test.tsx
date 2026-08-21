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
  return {
    ...actual,
    useTruck: jest.fn(),
  };
});

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { LoadManifestScreen } from './LoadManifestScreen';
import { useAuth } from '../context/AuthContext';
import { useTruck } from '../context/TruckContext';
import { ApiError } from '../services/apiClient';

const mockedUseAuth = useAuth as jest.Mock;
const mockedUseTruck = useTruck as jest.Mock;
const mockedLaunchImageLibraryAsync = ImagePicker.launchImageLibraryAsync as jest.Mock;
const mockedLaunchCameraAsync = ImagePicker.launchCameraAsync as jest.Mock;
const mockedRequestMediaLibraryPermissionsAsync =
  ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock;
const mockedRequestCameraPermissionsAsync =
  ImagePicker.requestCameraPermissionsAsync as jest.Mock;

const assignedTruck = {
  assignmentId: 'a-1',
  kind: 'titular' as const,
  truckId: 'truck-1',
  code: 'CAMION-07',
  plate: 'AB123CD',
  capacity: 40,
  startDate: '2026-02-01T00:00:00.000Z',
  endDate: null,
};

const baseTruckValue = {
  truck: assignedTruck,
  date: '2026-02-11',
  status: 'ready' as const,
  error: null,
  reload: jest.fn(),
};

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

  mockedUseTruck.mockReturnValue(baseTruckValue);

  mockedRequestMediaLibraryPermissionsAsync.mockClear();
  mockedRequestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
  mockedRequestCameraPermissionsAsync.mockClear();
  mockedRequestCameraPermissionsAsync.mockResolvedValue({ granted: true });

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

describe('LoadManifestScreen/camion asignado (guard)', () => {
  it('shows the assigned truck and enables the save button', async () => {
    await render(<LoadManifestScreen />);

    expect(screen.getByTestId('load-manifest-assigned-truck')).toBeTruthy();
    expect(screen.getByText(/CAMION-07/)).toBeTruthy();
    expect(screen.getByTestId('load-manifest-save-button').props.accessibilityState.disabled).toBe(
      false,
    );
  });

  it('blocks the manifest and disables save when the driver has no truck today', async () => {
    mockedUseTruck.mockReturnValue({ ...baseTruckValue, truck: null });

    await render(<LoadManifestScreen />);

    expect(screen.getByTestId('load-manifest-no-truck')).toBeTruthy();
    expect(screen.getByTestId('load-manifest-save-button').props.accessibilityState.disabled).toBe(
      true,
    );

    await fireEvent.press(screen.getByTestId('load-manifest-qty-increment-G10'));
    await fireEvent.press(screen.getByTestId('load-manifest-save-button'));

    expect(mockedApiPost).not.toHaveBeenCalled();
  });

  it('distinguishes a connection failure from having no truck assigned', async () => {
    mockedUseTruck.mockReturnValue({
      ...baseTruckValue,
      truck: null,
      status: 'error',
      error: 'No se pudo consultar tu camion asignado.',
    });

    await render(<LoadManifestScreen />);

    expect(screen.getByTestId('load-manifest-truck-error')).toBeTruthy();
    expect(screen.queryByTestId('load-manifest-no-truck')).toBeNull();
  });

  it('does not block on a still-loading truck status', async () => {
    mockedUseTruck.mockReturnValue({ ...baseTruckValue, truck: null, status: 'loading' });

    await render(<LoadManifestScreen />);

    expect(screen.queryByTestId('load-manifest-no-truck')).toBeNull();
    expect(screen.queryByTestId('load-manifest-truck-error')).toBeNull();
  });
});

describe('LoadManifestScreen/product stepper', () => {
  it('increments and decrements per-product quantity', async () => {
    await render(<LoadManifestScreen />);

    expect(screen.getByTestId('load-manifest-qty-value-G10').props.children).toBe(0);

    await fireEvent.press(screen.getByTestId('load-manifest-qty-increment-G10'));
    await fireEvent.press(screen.getByTestId('load-manifest-qty-increment-G10'));
    expect(screen.getByTestId('load-manifest-qty-value-G10').props.children).toBe(2);

    await fireEvent.press(screen.getByTestId('load-manifest-qty-decrement-G10'));
    expect(screen.getByTestId('load-manifest-qty-value-G10').props.children).toBe(1);
  });

  it('never goes below zero', async () => {
    await render(<LoadManifestScreen />);

    await fireEvent.press(screen.getByTestId('load-manifest-qty-decrement-G15'));
    expect(screen.getByTestId('load-manifest-qty-value-G15').props.children).toBe(0);
  });

  it('filters products with quantity 0 before building the submitted items', async () => {
    mockedApiPost.mockResolvedValue({ id: 'lm-1' });

    await render(<LoadManifestScreen />);
    await fireEvent.press(screen.getByTestId('load-manifest-qty-increment-G10'));
    await fireEvent.press(screen.getByTestId('load-manifest-qty-increment-G10'));
    await fireEvent.press(screen.getByTestId('load-manifest-qty-increment-G45'));
    await fireEvent.press(screen.getByTestId('load-manifest-save-button'));

    await waitFor(() =>
      expect(mockedApiPost).toHaveBeenCalledWith(
        '/load-manifests',
        expect.objectContaining({
          items: [
            { productCode: 'G10', quantity: 2 },
            { productCode: 'G45', quantity: 1 },
          ],
        }),
      ),
    );
  });
});

describe('LoadManifestScreen/photo (optional)', () => {
  it('shows an error and does not upload when gallery permission is denied', async () => {
    mockedRequestMediaLibraryPermissionsAsync.mockResolvedValueOnce({ granted: false });

    await render(<LoadManifestScreen />);
    await fireEvent.press(screen.getByTestId('load-manifest-pick-gallery'));

    await waitFor(() =>
      expect(
        screen.getByText('Permiso de galeria requerido para adjuntar la foto del remito.'),
      ).toBeTruthy(),
    );
    expect(mockedApiPostForm).not.toHaveBeenCalled();
  });

  it('does not attempt an upload when the gallery picker is canceled', async () => {
    mockedLaunchImageLibraryAsync.mockResolvedValueOnce({ canceled: true });

    await render(<LoadManifestScreen />);
    await fireEvent.press(screen.getByTestId('load-manifest-pick-gallery'));

    await waitFor(() => expect(mockedLaunchImageLibraryAsync).toHaveBeenCalledTimes(1));
    expect(mockedApiPostForm).not.toHaveBeenCalled();
    expect(screen.getByTestId('load-manifest-photo-ref').props.value).toBe('');
  });

  it('uploads the picked image via api.postForm and stores the resulting reference', async () => {
    mockedApiPostForm.mockResolvedValue({ url: 'https://cdn.test/manifest-1.jpg' });

    await render(<LoadManifestScreen />);
    await fireEvent.press(screen.getByTestId('load-manifest-pick-gallery'));

    await waitFor(() => expect(mockedApiPostForm).toHaveBeenCalledTimes(1));
    expect(mockedApiPostForm).toHaveBeenCalledWith('/uploads/receipt', expect.any(FormData));
    expect(screen.getByTestId('load-manifest-photo-ref').props.value).toBe(
      'https://cdn.test/manifest-1.jpg',
    );
  });

  it('uploads a captured photo via the camera the same way', async () => {
    mockedApiPostForm.mockResolvedValue({ url: 'https://cdn.test/manifest-2.jpg' });

    await render(<LoadManifestScreen />);
    await fireEvent.press(screen.getByTestId('load-manifest-capture-camera'));

    await waitFor(() => expect(mockedApiPostForm).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('load-manifest-photo-ref').props.value).toBe(
      'https://cdn.test/manifest-2.jpg',
    );
  });

  it('shows a distinct error when the upload fails, without losing retry ability', async () => {
    mockedApiPostForm.mockRejectedValueOnce(new Error('Network request failed'));
    mockedApiPostForm.mockResolvedValueOnce({ url: 'https://cdn.test/manifest-3.jpg' });

    await render(<LoadManifestScreen />);
    await fireEvent.press(screen.getByTestId('load-manifest-pick-gallery'));

    await waitFor(() =>
      expect(screen.getByText('No se pudo subir la foto del remito.')).toBeTruthy(),
    );
    expect(screen.getByTestId('load-manifest-photo-ref').props.value).toBe('');

    await fireEvent.press(screen.getByTestId('load-manifest-pick-gallery'));

    await waitFor(() => expect(mockedApiPostForm).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('load-manifest-photo-ref').props.value).toBe(
      'https://cdn.test/manifest-3.jpg',
    );
  });
});

describe('LoadManifestScreen/save manifest', () => {
  it('submits truckId/truckCode from the assignment and resets quantities on success', async () => {
    mockedApiPost.mockResolvedValue({ id: 'lm-1' });

    await render(<LoadManifestScreen />);
    await fireEvent.press(screen.getByTestId('load-manifest-qty-increment-G10'));
    await fireEvent.press(screen.getByTestId('load-manifest-save-button'));

    await waitFor(() =>
      expect(mockedApiPost).toHaveBeenCalledWith('/load-manifests', {
        driverName: 'chofer1',
        truckId: 'truck-1',
        truckCode: 'CAMION-07',
        items: [{ productCode: 'G10', quantity: 1 }],
        photoRef: undefined,
        note: undefined,
      }),
    );
    expect(screen.getByText('Remito guardado correctamente.')).toBeTruthy();
    expect(screen.getByTestId('load-manifest-qty-value-G10').props.children).toBe(0);
  });

  it('requires at least one product before saving', async () => {
    await render(<LoadManifestScreen />);
    await fireEvent.press(screen.getByTestId('load-manifest-save-button'));

    await waitFor(() =>
      expect(screen.getByText('items must include at least one product')).toBeTruthy(),
    );
    expect(mockedApiPost).not.toHaveBeenCalled();
  });

  it('shows distinct failure feedback when the API rejects, without crashing the screen', async () => {
    mockedApiPost.mockRejectedValue(new ApiError(500, 'API 500'));

    await render(<LoadManifestScreen />);
    await fireEvent.press(screen.getByTestId('load-manifest-qty-increment-G15'));
    await fireEvent.press(screen.getByTestId('load-manifest-save-button'));

    await waitFor(() => expect(screen.getByText('API 500')).toBeTruthy());
    expect(screen.queryByText('Remito guardado correctamente.')).toBeNull();
    expect(screen.getByTestId('load-manifest-qty-value-G15').props.children).toBe(1);
  });
});
