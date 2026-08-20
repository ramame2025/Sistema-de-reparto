jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from './AuthContext';
import { TruckProvider, useTruck, localDay } from './TruckContext';

const DRIVER_AUTH_TOKEN_KEY = 'driver_auth_token_v1';

const jsonResponse = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as Response;

const truck = {
  assignmentId: 'cov-1',
  kind: 'cobertura' as const,
  truckId: 'truck-1',
  code: 'T-01',
  plate: 'AB123CD',
  capacity: 40,
  startDate: '2026-02-10T00:00:00.000Z',
  endDate: '2026-02-12T00:00:00.000Z',
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>
    <TruckProvider>{children}</TruckProvider>
  </AuthProvider>
);

const useHarness = () => ({ auth: useAuth(), truck: useTruck() });

/** Rutea /auth/me y deja que `myTruck` decida que devuelve el endpoint /me. */
const makeFetchRouter = (myTruck: () => Promise<Response>): typeof fetch =>
  jest.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/auth/me')) {
      return Promise.resolve(jsonResponse({ username: 'chofer1', role: 'chofer' }));
    }
    if (url.includes('/driver-truck-assignments/me')) {
      return myTruck();
    }
    return Promise.resolve(jsonResponse({}));
  }) as unknown as typeof fetch;

const renderAuthenticated = async (myTruck: () => Promise<Response>) => {
  await AsyncStorage.setItem(DRIVER_AUTH_TOKEN_KEY, 'saved-token');
  globalThis.fetch = makeFetchRouter(myTruck);
  const { result } = await renderHook(() => useHarness(), { wrapper });
  await waitFor(() => expect(result.current.auth.status).toBe('authenticated'));
  return result;
};

describe('localDay', () => {
  it('formats the DEVICE local date, not UTC', () => {
    // Un chofer en Argentina a las 21:00 del 10 esta en el 11 en UTC. El dia
    // que importa es el suyo, asi que se arma con getFullYear/Month/Date.
    const lateAtNight = new Date(2026, 1, 10, 21, 30, 0);

    expect(localDay(lateAtNight)).toBe('2026-02-10');
  });

  it('pads month and day to two digits', () => {
    expect(localDay(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('TruckContext', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('asks the API for the truck of the device local day', async () => {
    const result = await renderAuthenticated(() =>
      Promise.resolve(jsonResponse({ date: localDay(), truck })),
    );

    await waitFor(() => expect(result.current.truck.status).toBe('ready'));
    expect(result.current.truck.truck).toEqual(truck);
    const urls = (globalThis.fetch as jest.Mock).mock.calls.map(([input]) => String(input));
    expect(urls.some((u) => u.includes(`/driver-truck-assignments/me?date=${localDay()}`))).toBe(
      true,
    );
  });

  it('exposes truck === null when the driver has no truck today, without becoming an error', async () => {
    // "Hoy no manejas" es una respuesta valida, no una falla: la pantalla
    // tiene que poder distinguirla de un problema de red.
    const result = await renderAuthenticated(() =>
      Promise.resolve(jsonResponse({ date: '2026-01-15', truck: null })),
    );

    await waitFor(() => expect(result.current.truck.status).toBe('ready'));
    expect(result.current.truck.truck).toBeNull();
    expect(result.current.truck.error).toBeNull();
  });

  it('goes to error status when the request fails, keeping truck null', async () => {
    const result = await renderAuthenticated(() =>
      Promise.resolve(jsonResponse({ message: 'boom' }, 500)),
    );

    await waitFor(() => expect(result.current.truck.status).toBe('error'));
    expect(result.current.truck.truck).toBeNull();
    expect(result.current.truck.error).not.toBeNull();
  });

  it('reload() refetches, so a truck assigned mid-shift shows up without restarting the app', async () => {
    let payload: unknown = { date: localDay(), truck: null };
    const result = await renderAuthenticated(() => Promise.resolve(jsonResponse(payload)));

    await waitFor(() => expect(result.current.truck.status).toBe('ready'));
    expect(result.current.truck.truck).toBeNull();

    payload = { date: localDay(), truck };
    await act(async () => {
      await result.current.truck.reload();
    });

    expect(result.current.truck.truck).toEqual(truck);
  });
});
