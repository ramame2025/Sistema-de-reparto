/**
 * Escala de radios de borde. Antes cada pantalla escribia `borderRadius: 10`
 * a mano (inputs) o `spacing.sm` (cards): dos numeros distintos sin nombre.
 * Aca quedan nombrados y en un solo lugar.
 */
export const radii = {
  sm: 8, // Cards, banners.
  md: 10, // Inputs, campos de texto.
  lg: 16, // Contenedores destacados.
  pill: 999, // Chips y badges redondeados.
} as const;

export type RadiusToken = keyof typeof radii;
