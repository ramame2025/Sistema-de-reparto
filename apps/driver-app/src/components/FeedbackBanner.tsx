import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

export type FeedbackTone = 'success' | 'error' | 'warning' | 'info';

export type FeedbackBannerProps = {
  message: string | null;
  tone: FeedbackTone;
};

const TONE_BACKGROUND: Record<FeedbackTone, string> = {
  success: colors.success,
  error: colors.error,
  warning: colors.warning,
  info: colors.secondary,
};

export function FeedbackBanner({ message, tone }: FeedbackBannerProps) {
  if (!message) {
    return null;
  }

  return (
    <View
      role="alert"
      accessible
      style={[styles.banner, { backgroundColor: TONE_BACKGROUND[tone] }]}
    >
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    padding: spacing.sm,
    borderRadius: spacing.xs,
    marginBottom: spacing.sm,
  },
  text: {
    color: colors.surface,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
  },
});
