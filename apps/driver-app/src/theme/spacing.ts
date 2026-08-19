export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
} as const;

export const MIN_TOUCH_TARGET = 48;

export type SpacingToken = keyof typeof spacing;
