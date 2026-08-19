jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth, AuthRoleError } from './AuthContext';
import { ApiError } from '../services/apiClient';

const DRIVER_AUTH_TOKEN_KEY = 'driver_auth_token_v1';

const jsonResponse = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as Response;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

describe('AuthContext/restore-on-mount', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    globalThis.fetch = jest.fn();
  });

  it('starts in "checking" status while the restore is pending, then moves to "anonymous" when no token is stored', async () => {
    // `mockImplementationOnce` overrides only the very next call and then
    // falls back to the real mock implementation — unlike `jest.spyOn(...)`
    // + `mockRestore()`, which cannot recover the original implementation
    // when the spied method (here, the official AsyncStorage jest mock's
    // `getItem`) was already a jest mock function before the spy was set up.
    let resolveGetItem!: (value: string | null) => void;
    const pending = new Promise<string | null>((resolve) => {
      resolveGetItem = resolve;
    });
    (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(() => pending);

    const { result } = await renderHook(() => useAuth(), { wrapper });

    expect(result.current.status).toBe('checking');

    await act(async () => {
      resolveGetItem(null);
      await pending;
    });

    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    expect(result.current.token).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('restores a valid saved token by validating it against GET /auth/me', async () => {
    await AsyncStorage.setItem(DRIVER_AUTH_TOKEN_KEY, 'saved-token');
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ username: 'chofer1', role: 'chofer' }),
    );

    const { result } = await renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(result.current.token).toBe('saved-token');
    expect(result.current.username).toBe('chofer1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:4000/auth/me',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer saved-token' }),
      }),
    );
  });

  it('clears the saved token and goes anonymous when the role is not chofer/admin', async () => {
    await AsyncStorage.setItem(DRIVER_AUTH_TOKEN_KEY, 'saved-token');
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ username: 'someone', role: 'operador' }),
    );

    const { result } = await renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    expect(result.current.token).toBeNull();
    expect(await AsyncStorage.getItem(DRIVER_AUTH_TOKEN_KEY)).toBeNull();
  });

  it('clears the saved token and goes anonymous on a 403/failed validation response', async () => {
    await AsyncStorage.setItem(DRIVER_AUTH_TOKEN_KEY, 'saved-token');
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => '',
    } as Response);

    const { result } = await renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    expect(result.current.token).toBeNull();
    expect(await AsyncStorage.getItem(DRIVER_AUTH_TOKEN_KEY)).toBeNull();
  });

  it('clears the saved token and goes anonymous on a network failure during validation', async () => {
    await AsyncStorage.setItem(DRIVER_AUTH_TOKEN_KEY, 'saved-token');
    (globalThis.fetch as jest.Mock).mockRejectedValue(new TypeError('Network request failed'));

    const { result } = await renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    expect(result.current.token).toBeNull();
    expect(await AsyncStorage.getItem(DRIVER_AUTH_TOKEN_KEY)).toBeNull();
  });
});

describe('AuthContext/login', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    globalThis.fetch = jest.fn();
  });

  it('calls POST /auth/login unauthenticated, persists the token, and sets status to authenticated', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({
        accessToken: 'new-token',
        username: 'chofer1',
        role: 'chofer',
        expiresInSeconds: 3600,
      }),
    );
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('anonymous'));

    await act(async () => {
      await result.current.login('chofer1', 'secret');
    });

    expect(result.current.status).toBe('authenticated');
    expect(result.current.token).toBe('new-token');
    expect(result.current.username).toBe('chofer1');
    expect(await AsyncStorage.getItem(DRIVER_AUTH_TOKEN_KEY)).toBe('new-token');

    const [, requestInit] = (globalThis.fetch as jest.Mock).mock.calls.at(-1) as [
      string,
      RequestInit,
    ];
    expect((requestInit.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('throws ApiError on failed credentials and stays anonymous', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'invalid credentials',
    } as Response);
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('anonymous'));

    await expect(
      act(async () => {
        await result.current.login('chofer1', 'wrong');
      }),
    ).rejects.toEqual(new ApiError(401, 'invalid credentials'));

    expect(result.current.status).toBe('anonymous');
    expect(result.current.token).toBeNull();
  });

  it('throws AuthRoleError when the account has no chofer/admin role and does not authenticate', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({
        accessToken: 'x',
        username: 'operador1',
        role: 'operador',
        expiresInSeconds: 3600,
      }),
    );
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('anonymous'));

    await expect(
      act(async () => {
        await result.current.login('operador1', 'secret');
      }),
    ).rejects.toBeInstanceOf(AuthRoleError);

    expect(result.current.status).toBe('anonymous');
    expect(result.current.token).toBeNull();
    expect(await AsyncStorage.getItem(DRIVER_AUTH_TOKEN_KEY)).toBeNull();
  });
});

describe('AuthContext/logout', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    globalThis.fetch = jest.fn();
  });

  it('clears the storage key and resets status to anonymous', async () => {
    await AsyncStorage.setItem(DRIVER_AUTH_TOKEN_KEY, 'saved-token');
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ username: 'chofer1', role: 'chofer' }),
    );
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.status).toBe('anonymous');
    expect(result.current.token).toBeNull();
    expect(await AsyncStorage.getItem(DRIVER_AUTH_TOKEN_KEY)).toBeNull();
  });
});

describe('AuthContext/requireAuthToken', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    globalThis.fetch = jest.fn();
  });

  it('returns null when anonymous, with no side effect', async () => {
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('anonymous'));

    expect(result.current.requireAuthToken()).toBeNull();
  });

  it('returns the current token once authenticated', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({
        accessToken: 'new-token',
        username: 'chofer1',
        role: 'chofer',
        expiresInSeconds: 3600,
      }),
    );
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('anonymous'));

    await act(async () => {
      await result.current.login('chofer1', 'secret');
    });

    expect(result.current.requireAuthToken()).toBe('new-token');
  });
});

describe('AuthContext/api', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    globalThis.fetch = jest.fn();
  });

  it('exposes a stable ApiClient identity that does not change across logins', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({
        accessToken: 'new-token',
        username: 'chofer1',
        role: 'chofer',
        expiresInSeconds: 3600,
      }),
    );
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('anonymous'));

    const apiBeforeLogin = result.current.api;

    await act(async () => {
      await result.current.login('chofer1', 'secret');
    });

    expect(result.current.api).toBe(apiBeforeLogin);
  });

  it('uses the freshly logged-in token for subsequent api calls (no stale closure)', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({
        accessToken: 'fresh-token',
        username: 'chofer1',
        role: 'chofer',
        expiresInSeconds: 3600,
      }),
    );
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('anonymous'));

    await act(async () => {
      await result.current.login('chofer1', 'secret');
    });

    (globalThis.fetch as jest.Mock).mockClear();
    (globalThis.fetch as jest.Mock).mockResolvedValue(jsonResponse({ ok: true }));

    await act(async () => {
      await result.current.api.get('/sales');
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:4000/sales',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer fresh-token' }),
      }),
    );
  });
});
