import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './AuthContext';

/** El camion que el chofer maneja hoy, ya resuelto por la API. */
export type AssignedTruck = {
  assignmentId: string;
  kind: 'titular' | 'cobertura';
  truckId: string;
  code: string;
  plate: string;
  capacity: number;
  startDate: string;
  endDate: string | null;
};

type MyTruckResponse = {
  date: string;
  truck: AssignedTruck | null;
};

export type TruckStatus = 'idle' | 'loading' | 'ready' | 'error';

export type TruckContextValue = {
  truck: AssignedTruck | null;
  date: string | null;
  status: TruckStatus;
  error: string | null;
  reload(): Promise<void>;
};

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * Dia local DEL DISPOSITIVO. Se arma con getFullYear/Month/Date en vez de
 * toISOString: un chofer a las 21:00 del 10 ya esta en el 11 en UTC, y el dia
 * que decide que camion maneja es el suyo, no el del meridiano de Greenwich.
 */
export const localDay = (date: Date = new Date()): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const TruckContext = createContext<TruckContextValue | undefined>(undefined);

export function TruckProvider({ children }: { children: ReactNode }) {
  const { api, token } = useAuth();

  const [truck, setTruck] = useState<AssignedTruck | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [status, setStatus] = useState<TruckStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setStatus('idle');
      return;
    }

    setStatus('loading');
    setError(null);

    try {
      const today = localDay();
      const response = await api.get<MyTruckResponse>(
        `/driver-truck-assignments/me?date=${today}`,
        { cache: 'no-store' },
      );

      // `truck: null` es una respuesta valida ("hoy no manejas"), no un error.
      setTruck(response.truck);
      setDate(response.date);
      setStatus('ready');
    } catch {
      setTruck(null);
      setError('No se pudo consultar tu camion asignado.');
      setStatus('error');
    }
  }, [api, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const value = useMemo<TruckContextValue>(
    () => ({ truck, date, status, error, reload: load }),
    [truck, date, status, error, load],
  );

  return <TruckContext.Provider value={value}>{children}</TruckContext.Provider>;
}

export function useTruck(): TruckContextValue {
  const context = useContext(TruckContext);

  if (!context) {
    throw new Error('useTruck must be used within a TruckProvider');
  }

  return context;
}
