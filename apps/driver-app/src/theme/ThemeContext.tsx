import { createContext, useContext } from 'react';
import { lightColors, type Colors } from './colors';

export type ColorScheme = 'light' | 'dark';

export type ThemeContextValue = {
  scheme: ColorScheme;
  colors: Colors;
  setScheme(scheme: ColorScheme): void;
};

/**
 * Solo el contexto y sus lectores. La persistencia de la preferencia vive en
 * `ThemeProvider`, aparte y a proposito: casi todos los componentes de la app
 * importan este modulo para leer un color, y ninguno de ellos tiene por que
 * arrastrar AsyncStorage para hacerlo.
 */
export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/**
 * La paleta vigente. Cae en la clara cuando no hay provider arriba, en vez de
 * tirar: la app declara el tema claro por defecto, y decenas de tests montan
 * un componente suelto sin envolverlo en nada.
 */
export function useColors(): Colors {
  return useContext(ThemeContext)?.colors ?? lightColors;
}

/** Para quien ademas de los colores necesita cambiarlos: el menu del chofer. */
export function useTheme(): ThemeContextValue {
  return (
    useContext(ThemeContext) ?? {
      scheme: 'light',
      colors: lightColors,
      setScheme: () => undefined,
    }
  );
}
