import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { MIN_TOUCH_TARGET, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { formatArs } from '../utils/currency';

export type SaleFooterBarProps = {
  total: number;
  /** Como se llama el numero en esta pantalla. En Gastos sale, no entra. */
  totalLabel?: string;
  /**
   * The single action of the screen, whose wording is what tells the driver
   * why it is unavailable ("Elegí un cliente", "Agregá productos") instead of
   * leaving a dead grey button with no explanation.
   */
  actionLabel: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
};

/** Running total and the screen's only action, pinned outside the scroll. */
export function SaleFooterBar({
  total,
  totalLabel = 'TOTAL',
  actionLabel,
  onPress,
  disabled = false,
  testID,
}: SaleFooterBarProps) {
  return (
    <View style={styles.bar} testID={testID}>
      <View style={styles.totalWrap}>
        <Text style={styles.totalLabel}>{totalLabel}</Text>
        <Text style={styles.totalValue} testID="sale-footer-total">
          {formatArs(total)}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        testID="sale-footer-action"
        style={[styles.action, disabled ? styles.actionDisabled : styles.actionEnabled]}
      >
        <Text style={[styles.actionLabel, disabled && styles.actionLabelDisabled]}>
          {actionLabel}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  totalWrap: {
    minWidth: 88,
  },
  totalLabel: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    color: colors.textSecondary,
    letterSpacing: 0.7,
  },
  totalValue: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  action: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  actionEnabled: {
    backgroundColor: colors.primary,
  },
  actionDisabled: {
    backgroundColor: colors.border,
  },
  actionLabel: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.surface,
  },
  actionLabelDisabled: {
    color: colors.textSecondary,
  },
});
