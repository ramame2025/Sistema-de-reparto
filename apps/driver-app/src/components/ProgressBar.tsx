import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';

export type ProgressBarProps = {
  current: number;
  total: number;
  testID?: string;
};

/** Barra de avance. Un total en cero se dibuja vacia, no se divide por cero. */
export function ProgressBar({ current, total, testID }: ProgressBarProps) {
  const ratio = total <= 0 ? 0 : Math.min(1, Math.max(0, current / total));

  return (
    <View style={styles.track} testID={testID}>
      <View
        style={[styles.fill, { width: `${Math.round(ratio * 100)}%` }]}
        testID={testID ? `${testID}-fill` : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.success,
  },
});
