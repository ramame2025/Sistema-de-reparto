import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { MIN_TOUCH_TARGET, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

export type SegmentedPillOption<T extends string> = {
  value: T;
  label: string;
};

export type SegmentedPillsProps<T extends string> = {
  options: readonly SegmentedPillOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Each pill gets `${testID}-${option.value}`. */
  testID?: string;
};

/**
 * Single-choice row of pills. The unselected state is an outline, not a
 * second fill colour: two filled colours read as two live states, which is
 * exactly the confusion the old primary/secondary Button pair created on the
 * payment-method row.
 */
export function SegmentedPills<T extends string>({
  options,
  value,
  onChange,
  testID,
}: SegmentedPillsProps<T>) {
  return (
    <View style={styles.row}>
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            testID={testID ? `${testID}-${option.value}` : undefined}
            style={[styles.pill, selected ? styles.pillSelected : styles.pillIdle]}
          >
            <Text style={[styles.label, selected ? styles.labelSelected : styles.labelIdle]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  pill: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    borderRadius: spacing.sm,
    borderWidth: 1,
  },
  pillSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillIdle: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  label: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
  },
  labelSelected: {
    color: colors.surface,
  },
  labelIdle: {
    color: colors.textPrimary,
  },
});
