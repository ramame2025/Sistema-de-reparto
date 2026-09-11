import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkColors, lightColors, type Colors } from './colors';
import { ThemeContext, type ColorScheme, type ThemeContextValue } from './ThemeContext';

const STORAGE_KEY = '@distribuidor/color-scheme';

const paletteFor = (scheme: ColorScheme): Colors =>
  scheme === 'dark' ? darkColors : lightColors;

/**
 * Tema de la app, elegido a mano por el chofer y recordado entre sesiones.
 *
 * No sigue al tema del sistema a proposito: el celular vive en la cabina, y
 * lo que manda ahi es si entra sol o no, que no es lo mismo que la hora a la
 * que el telefono decide ponerse oscuro. La eleccion es del chofer.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [scheme, setSchemeState] = useState<ColorScheme>('light');

  // La preferencia se restaura despues del primer render. Arrancar en claro y
  // corregir es preferible a dejar la app en blanco esperando a AsyncStorage.
  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && (stored === 'light' || stored === 'dark')) {
          setSchemeState(stored);
        }
      } catch {
        // Una preferencia que no se pudo leer no puede tumbar la app: se
        // sigue en claro, que es el default declarado.
      }
    };

    void restore();

    return () => {
      cancelled = true;
    };
  }, []);

  const setScheme = useCallback((next: ColorScheme) => {
    // El cambio se aplica ya; persistirlo es lo que puede fallar, y si falla
    // se pierde la preferencia pero no el cambio que el chofer acaba de pedir.
    setSchemeState(next);
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ scheme, colors: paletteFor(scheme), setScheme }),
    [scheme, setScheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
