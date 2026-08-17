import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

export type StatusBadgeStatus = 'success' | 'warning' | 'error' | 'info';

export type StatusBadgeProps = {
  label: string;
  status: StatusBadgeStatus;
  testID?: string;
};

const STATUS_COLORS: Record<StatusBadgeStatus, string> = {
  success: colors.success,
  warning: colors.warning,
  error: colors.error,
  info: colors.secondary,
};

export function StatusBadge({ label, status, testID }: StatusBadgeProps) {
  return (
    <View
      testID={testID}
      style={[styles.badge, { backgroundColor: STATUS_COLORS[status] }]}
    >
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: spacing.md,
  },
  label: {
    color: colors.surface,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
  },
});
