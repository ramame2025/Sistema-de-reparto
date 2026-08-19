import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AuthLoginResponse, AuthSessionResponse } from '@distribuidor/shared';
import { createApiClient, type ApiClient } from '../services/apiClient';

/** Preserved verbatim from the current App.tsx implementation — do not rename. */
export const DRIVER_AUTH_TOKEN_KEY = 'driver_auth_token_v1';

export type AuthStatus = 'checking' | 'anonymous' | 'authenticated';

/**
 * Thrown by `login()` when the account authenticates successfully but does
 * not hold the `chofer`/`admin` role required by this app.
 */
export class AuthRoleError extends Error {
  constructor() {
    super('Usuario sin permisos de chofer.');
  }
}

export type AuthContextValue = {
  status: AuthStatus;
  token: string | null;
  username: string;
  loading: boolean;
  api: ApiClient;
  login(username: string, password: string): Promise<void>;
  logout(): Promise<void>;
  requireAuthToken(): string | null;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);

  // `api` needs a stable identity but must always read the CURRENT token, so
  // the token is mirrored into a ref that the api client's getToken closure
  // reads from — this avoids a stale closure without recreating `api`.
  const tokenRef = useRef<string | null>(null);

  const getToken = useCallback(() => tokenRef.current, []);
  const api = useMemo(() => createApiClient(getToken), [getToken]);

  useEffect(() => {
    let cancelled = false;

    // Validates the saved token against the API before showing the app, so
    // an expired/invalid token returns to the login gate instead of letting
    // the user in and failing later.
    const restore = async () => {
      const savedToken = await AsyncStorage.getItem(DRIVER_AUTH_TOKEN_KEY);
      if (!savedToken) {
        if (!cancelled) {
          setStatus('anonymous');
        }
        return;
      }

      tokenRef.current = savedToken;

      try {
        const session = await api.get<AuthSessionResponse>('/auth/me');
        if (session.role !== 'chofer' && session.role !== 'admin') {
          throw new AuthRoleError();
        }

        if (cancelled) {
          return;
        }

        setUsername(session.username);
        setToken(savedToken);
        setStatus('authenticated');
      } catch {
        tokenRef.current = null;
        await AsyncStorage.removeItem(DRIVER_AUTH_TOKEN_KEY);
        if (!cancelled) {
          setToken(null);
          setStatus('anonymous');
        }
      }
    };

    void restore();

    return () => {
      cancelled = true;
    };
  }, [api]);

  const login = useCallback(
    async (loginUsername: string, password: string) => {
      setLoading(true);
      try {
        const payload = await api.post<AuthLoginResponse>(
          '/auth/login',
          { username: loginUsername, password },
          { auth: false },
        );

        if (payload.role !== 'chofer' && payload.role !== 'admin') {
          tokenRef.current = null;
          await AsyncStorage.removeItem(DRIVER_AUTH_TOKEN_KEY);
          setToken(null);
          setStatus('anonymous');
          throw new AuthRoleError();
        }

        tokenRef.current = payload.accessToken;
        setUsername(payload.username);
        setToken(payload.accessToken);
        setStatus('authenticated');
        await AsyncStorage.setItem(DRIVER_AUTH_TOKEN_KEY, payload.accessToken);
      } finally {
        setLoading(false);
      }
    },
    [api],
  );

  const logout = useCallback(async () => {
    tokenRef.current = null;
    await AsyncStorage.removeItem(DRIVER_AUTH_TOKEN_KEY);
    setToken(null);
    setStatus('anonymous');
  }, []);

  // Pure gate — returns the current token or null. No side effect: callers
  // now live in individual screens and render their own feedback.
  const requireAuthToken = useCallback(() => token, [token]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, token, username, loading, api, login, logout, requireAuthToken }),
    [status, token, username, loading, api, login, logout, requireAuthToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
