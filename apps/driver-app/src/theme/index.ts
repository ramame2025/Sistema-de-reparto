import { colors } from './colors';
import { spacing, MIN_TOUCH_TARGET } from './spacing';
import { typography } from './typography';

export const theme = {
  colors,
  spacing,
  typography,
  MIN_TOUCH_TARGET,
} as const;

export { colors, spacing, typography, MIN_TOUCH_TARGET };
export type { ColorToken } from './colors';
export type { SpacingToken } from './spacing';
export type { FontSizeToken, FontWeightToken } from './typography';
