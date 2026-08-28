import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { MIN_TOUCH_TARGET, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

export type ToggleRowProps = {
  label: string;
  /**
   * Reads back the current state in words. It carries more than the switch
   * can: "Sin marcar" is a third state the boolean cannot express, and the
   * caller uses it to distinguish "never asked" from an explicit "no".
   */
  subtitle: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  testID?: string;
};

/** Label plus state read-back on the left, switch on the right. */
export function ToggleRow({ label, subtitle, value, onValueChange, testID }: ToggleRowProps) {
  return (
    <View style={styles.row} testID={testID}>
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onValueChange}
        testID={testID ? `${testID}-switch` : undefined}
        trackColor={{ false: colors.border, true: colors.secondary }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: MIN_TOUCH_TARGET,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  text: {
    flex: 1,
  },
  label: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
