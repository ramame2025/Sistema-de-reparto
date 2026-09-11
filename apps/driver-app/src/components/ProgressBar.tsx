import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useColors } from '../theme/ThemeContext';
import type { Colors } from '../theme/colors';
import { spacing } from '../theme/spacing';

export type ProgressBarTone = 'success' | 'primary' | 'warning' | 'error';

export type ProgressBarProps = {
  current: number;
  total: number;
  tone?: ProgressBarTone;
  testID?: string;
};

const toneColor = (colors: Colors, tone: ProgressBarTone): string =>
  ({
    success: colors.success,
    primary: colors.primary,
    warning: colors.warning,
    error: colors.error,
  })[tone];

/** Barra de avance. Un total en cero se dibuja vacia, no se divide por cero. */
export function ProgressBar({ current, total, tone = 'success', testID }: ProgressBarProps) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const ratio = total <= 0 ? 0 : Math.min(1, Math.max(0, current / total));

  return (
    <View style={styles.track} testID={testID}>
      <View
        style={[styles.fill, { width: `${Math.round(ratio * 100)}%`, backgroundColor: toneColor(colors, tone) }]}
        testID={testID ? `${testID}-fill` : undefined}
      />
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
});
