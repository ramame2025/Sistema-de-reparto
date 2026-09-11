/**
 * Paleta de la app, en dos versiones que comparten exactamente las mismas
 * claves. Un componente pide un token por su significado ("el fondo de una
 * card", "el texto secundario") y nunca un color literal, asi que cambiar de
 * tema es cambiar de objeto y nada mas.
 */
export type Colors = {
  primary: string;
  primaryLight: string;
  secondary: string;
  background: string;
  surface: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  success: string;
  warning: string;
  error: string;
  /**
   * Lo que va ENCIMA de `primary`: el texto de las barras oscuras, el label de
   * un boton primario, los iconos de la cabecera.
   *
   * Existe como token propio porque antes era `surface`, que en claro tambien
   * es blanco y tapaba el problema. Las barras siguen siendo azul oscuro en
   * los dos temas, asi que lo que va encima es blanco en los dos: sin este
   * token, el tema oscuro pintaba el texto de la barra del color de una card
   * -- casi negro sobre azul marino.
   */
  onPrimary: string;
};

export const lightColors: Colors = {
  primary: '#1E3A5F',
  primaryLight: '#2E5A8F',
  secondary: '#0F9B8E',
  background: '#F5F6F8',
  surface: '#FFFFFF',
  border: '#E1E4E8',
  textPrimary: '#1A1D21',
  textSecondary: '#6B7280',
  success: '#2E9E5B',
  warning: '#D89614',
  error: '#D93B3B',
  onPrimary: '#FFFFFF',
};

/**
 * Para manejar de noche. Las barras conservan el azul de la marca -- son lo
 * unico que no se oscurece -- y el resto baja a grises muy oscuros. Los
 * colores de estado suben de luminosidad: el rojo y el verde de la version
 * clara pierden contraste sobre un fondo oscuro, y son justo los que avisan
 * que algo esta mal.
 */
export const darkColors: Colors = {
  primary: '#1E3A5F',
  primaryLight: '#2E5A8F',
  secondary: '#14B8A6',
  background: '#0E1116',
  surface: '#171B21',
  border: '#2A2F37',
  textPrimary: '#E8EAED',
  textSecondary: '#9AA1AC',
  success: '#3FB96E',
  warning: '#E0A32E',
  error: '#EF5B5B',
  onPrimary: '#FFFFFF',
};

/**
 * La paleta clara, que es la que la app usa por defecto. Se mantiene como
 * export con nombre porque es el valor al que cae `useColors()` cuando no hay
 * ThemeProvider arriba.
 */
export const colors = lightColors;

export type ColorToken = keyof Colors;
