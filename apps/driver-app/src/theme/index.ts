import { colors } from './colors';
import { radii } from './radii';
import { spacing, MIN_TOUCH_TARGET } from './spacing';
import { typography } from './typography';

export const theme = {
  colors,
  radii,
  spacing,
  typography,
  MIN_TOUCH_TARGET,
} as const;

export { colors, radii, spacing, typography, MIN_TOUCH_TARGET };
export type { ColorToken } from './colors';
export type { RadiusToken } from './radii';
export type { SpacingToken } from './spacing';
export type { FontSizeToken, FontWeightToken } from './typography';
