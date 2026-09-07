export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  // Para el aire entre secciones grandes de una pantalla: antes se hackeaba
  // sumando tokens (`spacing.md + spacing.lg`) o con marginTop sueltos.
  xl: 32,
} as const;

export const MIN_TOUCH_TARGET = 48;

export type SpacingToken = keyof typeof spacing;
