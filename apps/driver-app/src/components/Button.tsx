import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useColors } from '../theme/ThemeContext';
import type { Colors } from '../theme/colors';
import { spacing, MIN_TOUCH_TARGET } from '../theme/spacing';
import { typography } from '../theme/typography';

export type ButtonVariant = 'primary' | 'secondary';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  testID?: string;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  testID,
}: ButtonProps) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const backgroundColor =
    variant === 'primary' ? colors.primary : colors.secondary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={[
        styles.base,
        { backgroundColor: disabled ? colors.border : backgroundColor },
      ]}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: colors.onPrimary,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
  },
});
