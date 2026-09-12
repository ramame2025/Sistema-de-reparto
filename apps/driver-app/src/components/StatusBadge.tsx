import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors } from '../theme/ThemeContext';
import type { Colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

export type StatusBadgeStatus = 'success' | 'warning' | 'error' | 'info';

export type StatusBadgeProps = {
  label: string;
  status: StatusBadgeStatus;
  testID?: string;
};

const statusColor = (colors: Colors, status: StatusBadgeStatus): string =>
  ({
    success: colors.success,
    warning: colors.warning,
    error: colors.error,
    info: colors.secondary,
  })[status];

export function StatusBadge({ label, status, testID }: StatusBadgeProps) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View
      testID={testID}
      style={[styles.badge, { backgroundColor: statusColor(colors, status) }]}
    >
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: spacing.md,
  },
  label: {
    color: colors.onPrimary,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
  },
});
