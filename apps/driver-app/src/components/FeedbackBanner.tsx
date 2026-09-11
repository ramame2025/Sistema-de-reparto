import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors } from '../theme/ThemeContext';
import type { Colors } from '../theme/colors';
import { radii } from '../theme/radii';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

export type FeedbackTone = 'success' | 'error' | 'warning' | 'info';

export type FeedbackBannerProps = {
  message: string | null;
  tone: FeedbackTone;
  testID?: string;
};

/** El fondo del banner sale del tono, y el tono del tema vigente. */
const toneBackground = (colors: Colors, tone: FeedbackTone): string =>
  ({
    success: colors.success,
    error: colors.error,
    warning: colors.warning,
    info: colors.secondary,
  })[tone];

export function FeedbackBanner({ message, tone, testID }: FeedbackBannerProps) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (!message) {
    return null;
  }

  return (
    <View
      role="alert"
      accessible
      testID={testID}
      style={[styles.banner, { backgroundColor: toneBackground(colors, tone) }]}
    >
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
  banner: {
    padding: spacing.sm,
    borderRadius: radii.sm,
    // Sin marginBottom propio: el espaciado entre bloques lo pone el `gap` de
    // ScreenContainer. Cuando no hay mensaje el componente devuelve null y el
    // gap no deja hueco fantasma.
  },
  text: {
    color: colors.onPrimary,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
  },
});
